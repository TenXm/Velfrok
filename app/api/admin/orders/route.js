import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { auditLog } from "@/lib/audit";
import { clean } from "@/lib/sanitize";
import { rateLimit } from "@/lib/rate-limit";

const ALLOWED_PAYMENT_STATUSES = ["paid", "failed"];
const ALLOWED_ORDER_STATUSES = [
  "placed",
  "packed",
  "dispatched",
  "delivered",
  "cancelled",
];

function isResponse(value) {
  return value instanceof Response;
}

export async function GET(req) {
  const { user, error } = await requireAdmin(req);

  if (error) {
    return error;
  }

  try {
    await rateLimit(`admin-orders:get:${user.id || user.email}`, 30, 60);
  } catch (limitError) {
    if (isResponse(limitError)) {
      return limitError;
    }

    return Response.json(
      { error: "Rate limiting service is unavailable" },
      { status: 503 }
    );
  }

  const { data, error: queryError } = await supabaseAdmin()
    .from("orders")
    .select("*, payment_intents(token,status,utr,expires_at)")
    .order("created_at", { ascending: false })
    .limit(200);

  if (queryError) {
    return Response.json(
      { error: "Could not load orders" },
      { status: 500 }
    );
  }

  return Response.json({ orders: data || [] });
}

export async function PATCH(req) {
  const { user, error } = await requireAdmin(req);

  if (error) {
    return error;
  }

  try {
    await rateLimit(`admin-orders:patch:${user.id || user.email}`, 20, 60);
  } catch (limitError) {
    if (isResponse(limitError)) {
      return limitError;
    }

    return Response.json(
      { error: "Rate limiting service is unavailable" },
      { status: 503 }
    );
  }

  let body;

  try {
    body = await req.json();
  } catch {
    return Response.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const id = clean(body?.orderId, 40);

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return Response.json(
      { error: "Invalid order ID" },
      { status: 400 }
    );
  }

  const patch = {};

  if (body?.paymentStatus !== undefined) {
    if (!ALLOWED_PAYMENT_STATUSES.includes(body.paymentStatus)) {
      return Response.json(
        { error: "Invalid payment status" },
        { status: 400 }
      );
    }

    patch.payment_status = body.paymentStatus;
  }

  if (body?.orderStatus !== undefined) {
    if (!ALLOWED_ORDER_STATUSES.includes(body.orderStatus)) {
      return Response.json(
        { error: "Invalid order status" },
        { status: 400 }
      );
    }

    patch.status = body.orderStatus;
  }

  if (Object.keys(patch).length === 0) {
    return Response.json(
      { error: "Nothing to update" },
      { status: 400 }
    );
  }

  const admin = supabaseAdmin();

  // Confirm the order exists before attempting updates.
  const { data: existingOrder, error: lookupError } = await admin
    .from("orders")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (lookupError) {
    return Response.json(
      { error: "Could not verify order" },
      { status: 500 }
    );
  }

  if (!existingOrder) {
    return Response.json(
      { error: "Order not found" },
      { status: 404 }
    );
  }

  // Update payment intents when an admin changes payment status.
  if (patch.payment_status) {
    const { error: paymentError } = await admin
      .from("payment_intents")
      .update({ status: patch.payment_status })
      .eq("order_id", id);

    if (paymentError) {
      return Response.json(
        { error: "Could not update payment status" },
        { status: 500 }
      );
    }
  }

  const { error: updateError } = await admin
    .from("orders")
    .update(patch)
    .eq("id", id);

  if (updateError) {
    return Response.json(
      { error: "Could not update order" },
      { status: 500 }
    );
  }

  try {
    await auditLog(user.email, "order.update", {
      id,
      ...patch,
    });
  } catch {
    // The order update succeeded; audit logging failure should not
    // make the admin interface report that the update itself failed.
  }

  return Response.json({ ok: true });
}
