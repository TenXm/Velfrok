import { requireUser, supabaseForUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { validateCoupon } from "@/lib/coupons";

export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const { user, error } = await requireUser(req);
    if (error) return error;
    await rateLimit(`coupon-validation:${user.id}`, 10, 60);
    let body;
    try { body = await req.json(); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }
    const items = Array.isArray(body?.items) ? body.items.map((item) => ({
      productId: item?.product_id,
      quantity: item?.quantity,
    })) : [];
    const result = await validateCoupon({
      db: supabaseForUser(req), userId: user.id, code: body?.code, items,
    });
    if (result.error) return Response.json({ error: result.error }, { status: result.status || 400 });
    return Response.json({
      couponCode: result.couponCode,
      subtotal: result.subtotal,
      discountAmount: result.discountAmount,
      payable: result.payable,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Coupon validation API failed:", error);
    return Response.json({ error: "Unable to validate this coupon right now." }, { status: 500 });
  }
}
