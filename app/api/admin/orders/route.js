
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { auditLog } from "@/lib/audit";
import { clean } from "@/lib/sanitize";
import { rateLimit, clientIp } from "@/lib/rate-limit";

const ORDER_STATUSES = [
  "placed",
  "packed",
  "dispatched",
  "delivered",
  "cancelled",
];

export async function GET(req) {
  try {
    const { user, error } = await requireAdmin(req);
    if (error) return error;

    await rateLimit(`admin-orders-get:${user.id}`, 60, 60);

    const { data, error: dbError } = await supabaseAdmin()
      .from("orders")
      .select("*, payment_intents(token,status,utr,expires_at)")
      .order("created_at", { ascending: false })
      .limit(200);

    if (dbError) {
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

    return Response.json(
      { error: "Server error" },
      { status: 500 }
    );
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
    const orderStatus = body?.orderStatus;

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) {
      return Response.json(
        { error: "Invalid order ID" },
        { status: 400 }
      );
    }

    // Payment confirmation must use one database transaction.
    // Do not mark an order paid through separate API updates.
    if (paymentStatus === "paid") {
      return Response.json(
        {
          error: "Paid confirmation is temporarily disabled until atomic payment and stock processing is installed."
        },
        { status: 503 }
      );
    }

    if (
      paymentStatus !== undefined &&
      !["failed"].includes(paymentStatus)
    ) {
      return Response.json(
        { error: "Invalid payment status" },
        { status: 400 }
      );
    }

    if (
      orderStatus !== undefined &&
      !ORDER_STATUSES.includes(orderStatus)
    ) {
      return Response.json(
        { error: "Invalid order status" },
        { status: 400 }
      );
    }

    const patch = {};

    if (paymentStatus !== undefined) {
      patch.payment_status = paymentStatus;
    }

    if (orderStatus !== undefined) {
      patch.status = orderStatus;
    }

    if (Object.keys(patch).length === 0) {
      return Response.json(
        { error: "Nothing to update" },
        { status: 400 }
      );
    }

    const db = supabaseAdmin();

    const { data: existing, error: lookupError } = await db
      .from("orders")
      .select("id,payment_status,status")
      .eq("id", id)
      .maybeSingle();

    if (lookupError) {
      return Response.json(
        { error: "Could not verify order" },
        { status: 500 }
      );
    }

    if (!existing) {
      return Response.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    // Never overwrite a paid order through this endpoint.
    if (
      existing.payment_status === "paid" &&
      paymentStatus !== undefined
    ) {
      return Response.json(
        { error: "Paid orders cannot be changed through this endpoint" },
        { status: 409 }
      );
    }

    const { data: updated, error: updateError } = await db
      .from("orders")
      .update(patch)
      .eq("id", id)
      .neq("payment_status", "paid")
      .select("id")
      .maybeSingle();

    if (updateError) {
      return Response.json(
        { error: "Order update failed" },
        { status: 500 }
      );
    }

    if (!updated) {
      return Response.json(
        { error: "Order changed or is already paid. Refresh and try again." },
        { status: 409 }
      );
    }

    try {
      await auditLog(
        user.email || user.id,
        "order.update",
        { id, ...patch },
        clientIp(req)
      );
    } catch (auditError) {
      console.error("Admin audit logging failed:", auditError);
    }

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;

    console.error("Admin order update failed:", error);

    return Response.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}
