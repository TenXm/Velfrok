import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { auditLog } from "@/lib/audit";
import { clean } from "@/lib/sanitize";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(req) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const { data, error: queryError } = await supabaseAdmin()
    .from("orders")
    .select("*, payment_intents(token,status,utr,expires_at)")
    .order("created_at", { ascending: false })
    .limit(200);

  if (queryError) {
    return Response.json(
      { error: "Unable to load orders" },
      { status: 500 }
    );
  }

  return Response.json({ orders: data || [] });
}

export async function PATCH(req) {
  const { user, error } = await requireAdmin(req);
  if (error) return error;

  try {
    await rateLimit(`admin-order-update:${user.id}`, 20, 60);
  } catch (rateLimitError) {
    if (rateLimitError instanceof Response) {
      return rateLimitError;
    }

    console.error("Admin order rate limit failed:", rateLimitError);

    return Response.json(
      { error: "Unable to process request" },
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

  const { orderId, paymentStatus, orderStatus } = body || {};
  const id = clean(orderId, 40);

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return Response.json({ error: "Bad id" }, { status: 400 });
  }

  const patch = {};

  if (
    paymentStatus &&
    ["paid", "failed"].includes(paymentStatus)
  ) {
    patch.payment_status = paymentStatus;
  }

  if (
    orderStatus &&
    ["placed", "packed", "dispatched", "delivered", "cancelled"].includes(
      orderStatus
    )
  ) {
    patch.status = orderStatus;
  }

  if (!Object.keys(patch).length) {
    return Response.json(
      { error: "Nothing to update" },
      { status: 400 }
    );
  }

  const { error: updateError } = await supabaseAdmin()
    .from("orders")
    .update(patch)
    .eq("id", id);

  if (updateError) {
    console.error("Order update failed:", updateError.message);

    return Response.json(
      { error: "Update failed" },
      { status: 500 }
    );
  }

  if (patch.payment_status === "paid") {
    const { error: paymentError } = await supabaseAdmin()
      .from("payment_intents")
      .update({ status: "paid" })
      .eq("order_id", id);

    if (paymentError) {
      console.error(
        "Payment intent update failed:",
        paymentError.message
      );
    }
  }

  await auditLog(user.email, "order.update", {
    id,
    ...patch,
  });

  return Response.json({ ok: true });
}
