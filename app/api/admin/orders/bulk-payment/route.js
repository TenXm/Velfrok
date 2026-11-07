import { requireAdmin, supabaseForUser } from "@/lib/auth";
import { auditLog } from "@/lib/audit";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req) {
  try {
    const { user, error } = await requireAdmin(req);
    if (error) return error;
    await rateLimit("admin-orders-bulk-payment:" + user.id, 10, 60);

    let body;
    try { body = await req.json(); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }
    const orderIds = Array.isArray(body?.orderIds) ? [...new Set(body.orderIds)] : [];
    const paymentStatus = body?.paymentStatus;
    if (!orderIds.length || orderIds.length > 20 || orderIds.some((id) => typeof id !== "string" || !UUID.test(id))) {
      return Response.json({ error: "Select between 1 and 20 valid orders." }, { status: 400 });
    }
    if (!["accepted", "rejected"].includes(paymentStatus)) {
      return Response.json({ error: "Choose Accepted or Rejected." }, { status: 400 });
    }

    const db = supabaseForUser(req);
    const results = [];
    for (const orderId of orderIds) {
      const { data, error: rpcError } = await db.rpc(
        paymentStatus === "accepted" ? "confirm_order_payment" : "reject_order_payment",
        { p_order_id: orderId }
      );
      if (rpcError) {
        results.push({ orderId, ok: false, message: "Payment decision failed. Refresh and verify this order." });
        continue;
      }
      try {
        await auditLog(user.id, "order.payment." + paymentStatus, { actorEmail: user.email || null, id: orderId, result: data }, clientIp(req));
      } catch (auditError) {
        console.error("Bulk payment audit logging failed:", auditError);
      }
      results.push({ orderId, ok: true, result: data });
    }

    const succeeded = results.filter((item) => item.ok).length;
    const failed = results.length - succeeded;
    return Response.json({ ok: failed === 0, paymentStatus, succeeded, failed, results }, {
      status: succeeded ? 200 : 409,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Bulk payment decision failed:", error);
    return Response.json({ error: "Bulk payment update failed." }, { status: 500 });
  }
}