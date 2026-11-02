import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin, supabaseForUser } from "@/lib/auth";
import { auditLog } from "@/lib/audit";
import { clean } from "@/lib/sanitize";
import { rateLimit, clientIp } from "@/lib/rate-limit";

const PAYMENT_STATUSES = ["accepted", "rejected"];

const NEXT_STATUS = {
  pending: "packed",
  packed: "shipped",
  shipped: "delivered",
  delivered: null,
};

function fail(message, status) {
  return Response.json({ error: message }, { status });
}

export async function GET(req) {
  try {
    const { user, error } = await requireAdmin(req);
    if (error) return error;

    await rateLimit(`admin-orders-get:${user.id}`, 60, 60);

    const { data, error: dbError } = await supabaseAdmin()
      .from("orders")
      .select("*, order_items(*)")
      .order("created_at", { ascending: false })
      .limit(200);

    if (dbError) {
      console.error("Admin order lookup failed:", dbError.message);
      return fail("Could not load orders.", 500);
    }

    return Response.json(
      { orders: data || [] },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof Response) return error;

    console.error("Admin orders GET failed:", error);
    return fail("Server error.", 500);
  }
}

export async function PATCH(req) {
  try {
    const { user, error } = await requireAdmin(req);
    if (error) return error;

    await rateLimit(`admin-orders-patch:${user.id}`, 30, 60);

    let body;

    try {
      body = await req.json();
    } catch {
      return fail("Invalid request body.", 400);
    }

    const id = clean(body?.orderId, 36).toLowerCase();

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ) {
      return fail("Invalid order ID.", 400);
    }

    const hasPaymentChange = body?.paymentStatus !== undefined;
    const hasFulfillmentChange =
      body?.fulfillmentStatus !== undefined;

    if (hasPaymentChange === hasFulfillmentChange) {
      return fail(
        "Submit exactly one payment or fulfillment change.",
        400
      );
    }

    if (hasPaymentChange) {
      const paymentStatus = body.paymentStatus;

      if (!PAYMENT_STATUSES.includes(paymentStatus)) {
        return fail("Invalid payment status.", 400);
      }

      // Database functions perform the payment transition and
      // inventory restoration atomically using the admin's JWT.
      const userDb = supabaseForUser(req);

      const functionName =
        paymentStatus === "accepted"
          ? "confirm_order_payment"
          : "reject_order_payment";

      const { data, error: rpcError } = await userDb.rpc(
        functionName,
        { p_order_id: id }
      );

      if (rpcError) {
        console.error("Payment decision RPC failed:", rpcError.message);
        return fail(
          "Payment decision failed. Refresh and verify the order.",
          409
        );
      }

      try {
        await auditLog(
          user.email || user.id,
          `order.payment.${paymentStatus}`,
          { id, result: data },
          clientIp(req)
        );
      } catch (auditError) {
        console.error("Audit logging failed:", auditError);
      }

      return Response.json(
        { ok: true, result: data },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const fulfillmentStatus = body.fulfillmentStatus;

    if (
      typeof fulfillmentStatus !== "string" ||
      !Object.prototype.hasOwnProperty.call(
        NEXT_STATUS,
        fulfillmentStatus
      )
    ) {
      return fail("Invalid fulfillment status.", 400);
    }

    const db = supabaseAdmin();

    const { data: existing, error: lookupError } = await db
      .from("orders")
      .select("id,payment_status,fulfillment_status")
      .eq("id", id)
      .maybeSingle();

    if (lookupError) {
      console.error("Order lookup failed:", lookupError.message);
      return fail("Could not verify order.", 500);
    }

    if (!existing) {
      return fail("Order not found.", 404);
    }

    if (existing.fulfillment_status === fulfillmentStatus) {
      return Response.json({
        ok: true,
        fulfillmentStatus,
        unchanged: true,
      });
    }

    if (existing.payment_status !== "accepted") {
      return fail(
        "Payment must be accepted before fulfillment can change.",
        409
      );
    }

    if (NEXT_STATUS[existing.fulfillment_status] !== fulfillmentStatus) {
      return fail(
        "Invalid fulfillment transition. Advance one stage at a time.",
        409
      );
    }

    // Compare-and-swap: both the old fulfillment state and accepted
    // payment state must still match when the database writes.
    const { data: updated, error: updateError } = await db
      .from("orders")
      .update({ fulfillment_status: fulfillmentStatus })
      .eq("id", id)
      .eq("payment_status", "accepted")
      .eq("fulfillment_status", existing.fulfillment_status)
      .select("id,fulfillment_status")
      .maybeSingle();

    if (updateError) {
      console.error("Fulfillment update failed:", updateError.message);
      return fail("Fulfillment update failed.", 500);
    }

    if (!updated) {
      return fail(
        "The order changed while you were updating it. Refresh and try again.",
        409
      );
    }

    try {
      await auditLog(
        user.email || user.id,
        "order.fulfillment.update",
        { id, fulfillmentStatus },
        clientIp(req)
      );
    } catch (auditError) {
      console.error("Audit logging failed:", auditError);
    }

    return Response.json(
      { ok: true, order: updated },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof Response) return error;

    console.error("Admin orders PATCH failed:", error);
    return fail("Server error.", 500);
  }
}
