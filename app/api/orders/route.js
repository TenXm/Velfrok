
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin, supabaseForUser } from "@/lib/auth";
import { auditLog } from "@/lib/audit";
import { clean } from "@/lib/sanitize";
import { rateLimit, clientIp } from "@/lib/rate-limit";

const PAYMENT_STATUSES = ["accepted", "rejected"];
const FULFILLMENT_STATUSES = ["pending", "packed", "shipped", "delivered"];

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
      console.error("Admin order lookup failed:", dbError);
      return Response.json(
        { error: "Could not load orders" },
        { status: 500 }
      );
    }

    return Response.json(
      { orders: data || [] },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof Response) return error;

    console.error("Admin orders GET failed:", error);
    return Response.json({ error: "Server error" }, { status: 500 });
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
      return Response.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const id = clean(body?.orderId, 36).toLowerCase();
    const paymentStatus = body?.paymentStatus;
    const fulfillmentStatus = body?.fulfillmentStatus;

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)
    ) {
      return Response.json({ error: "Invalid order ID" }, { status: 400 });
    }

    // Do not combine two independent state transitions in one request.
    if (
      paymentStatus !== undefined &&
      fulfillmentStatus !== undefined
    ) {
      return Response.json(
        { error: "Update payment and fulfillment separately" },
        { status: 400 }
      );
    }

    if (
      paymentStatus !== undefined &&
      !PAYMENT_STATUSES.includes(paymentStatus)
    ) {
      return Response.json(
        { error: "Payment status must be accepted or rejected" },
        { status: 400 }
      );
    }

    if (
      fulfillmentStatus !== undefined &&
      !FULFILLMENT_STATUSES.includes(fulfillmentStatus)
    ) {
      return Response.json(
        { error: "Invalid fulfillment status" },
        { status: 400 }
      );
    }

    if (
      paymentStatus === undefined &&
      fulfillmentStatus === undefined
    ) {
      return Response.json(
        { error: "Nothing to update" },
        { status: 400 }
      );
    }

    // Payment decisions must go through database functions using
    // the administrator's actual JWT, so auth.uid() is preserved.
    if (paymentStatus !== undefined) {
      const userDb = supabaseForUser(req);

      const functionName =
        paymentStatus === "accepted"
          ? "confirm_order_payment"
          : "reject_order_payment";

      const { data, error: rpcError } = await userDb.rpc(functionName, {
        p_order_id: id,
      });

      if (rpcError) {
        console.error("Payment decision RPC failed:", rpcError);
        return Response.json(
          { error: "Payment decision failed. Refresh and verify the order." },
          { status: 409 }
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
        console.error("Admin audit logging failed:", auditError);
      }

      return Response.json({ ok: true, result: data });
    }

    // Fulfillment changes are separate from payment decisions.
    const db = supabaseAdmin();

    const { data: existing, error: lookupError } = await db
      .from("orders")
      .select("id,payment_status,fulfillment_status")
      .eq("id", id)
      .maybeSingle();

    if (lookupError) {
      return Response.json(
        { error: "Could not verify order" },
        { status: 500 }
      );
    }

    if (!existing) {
      return Response.json({ error: "Order not found" }, { status: 404 });
    }

    if (
      fulfillmentStatus !== "pending" &&
      existing.payment_status !== "accepted"
    ) {
      return Response.json(
        { error: "Payment must be accepted before fulfillment can advance" },
        { status: 409 }
      );
    }

    const { data: updated, error: updateError } = await db
      .from("orders")
      .update({ fulfillment_status: fulfillmentStatus })
      .eq("id", id)
      .eq("fulfillment_status", existing.fulfillment_status)
      .select("id,fulfillment_status")
      .maybeSingle();

    if (updateError) {
      console.error("Fulfillment update failed:", updateError);
      return Response.json(
        { error: "Fulfillment update failed" },
        { status: 500 }
      );
    }

    if (!updated) {
      return Response.json(
        { error: "Order changed. Refresh and try again." },
        { status: 409 }
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
      console.error("Admin audit logging failed:", auditError);
    }

    return Response.json({ ok: true, order: updated });
  } catch (error) {
    if (error instanceof Response) return error;

    console.error("Admin order update failed:", error);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
