import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { auditLog } from "@/lib/audit";
import { clean } from "@/lib/sanitize";
import { rateLimit } from "@/lib/rate-limit";

const ALLOWED_PAYMENT_STATUSES = [
  "pending_utr",
  "pending_verification",
  "accepted",
  "rejected"
];

const ALLOWED_ORDER_STATUSES = [
  "confirmed",
  "packed",
  "shipped",
  "delivered"
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
    .select("*, order_items(*)")
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

  if (body?.fulfillmentStatus !== undefined) {
    if (!ALLOWED_ORDER_STATUSES.includes(body.fulfillmentStatus)) {
      return Response.json(
        { error: "Invalid fulfillment status" },
        { status: 400 }
      );
    }

    patch.fulfillment_status = body.fulfillmentStatus;
  }

  if (Object.keys(patch).length === 0) {
    return Response.json(
      { error: "Nothing to update" },
      { status: 400 }
    );
  }

  const admin = supabaseAdmin();

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
    // Ignore audit log error if main update succeeds
  }

  return Response.json({ ok: true });
}
