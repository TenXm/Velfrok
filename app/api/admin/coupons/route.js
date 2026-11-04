import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

const fail = (message, status = 400) => Response.json({ error: message }, { status });
const clean = (v, max = 120) => typeof v === "string" ? v.trim().slice(0, max) : "";

async function guard(req, action) {
  const auth = await requireAdmin(req);
  if (auth.error) return { error: auth.error };
  await rateLimit(`admin-coupons-${action}:${auth.user.id}`, 40, 60);
  return { user: auth.user };
}

function couponInput(body) {
  const code = clean(body.code, 40).toUpperCase().replace(/\s+/g, "");
  const discountType = body.discount_type;
  const discountValue = Number(body.discount_value);
  const minOrderValue = Number(body.min_order_value ?? 0);
  const maxDiscount = body.max_discount === "" || body.max_discount == null ? null : Number(body.max_discount);
  const usageLimit = body.usage_limit === "" || body.usage_limit == null ? null : Number(body.usage_limit);
  const perCustomerLimit = body.per_customer_limit === "" || body.per_customer_limit == null ? null : Number(body.per_customer_limit);
  const expiryDate = body.expires_at ? new Date(body.expires_at) : null;
  if (expiryDate && Number.isNaN(expiryDate.getTime())) return { error: "Enter a valid expiry date." };
  const expiresAt = expiryDate ? expiryDate.toISOString() : null;

  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) return { error: "Coupon code must be 3–40 letters, numbers, hyphens or underscores." };
  if (!["percentage", "flat"].includes(discountType)) return { error: "Choose percentage or flat discount." };
  if (!Number.isFinite(discountValue) || discountValue <= 0 || (discountType === "percentage" && discountValue > 100)) return { error: "Enter a valid discount value." };
  if (!Number.isFinite(minOrderValue) || minOrderValue < 0) return { error: "Minimum order value cannot be negative." };
  if (maxDiscount !== null && (!Number.isFinite(maxDiscount) || maxDiscount <= 0)) return { error: "Maximum discount must be positive." };
  for (const value of [usageLimit, perCustomerLimit]) if (value !== null && (!Number.isInteger(value) || value < 1)) return { error: "Usage limits must be positive whole numbers." };
  return { value: { code, discount_type: discountType, discount_value: discountValue, min_order_value: minOrderValue, max_discount: maxDiscount, expires_at: expiresAt, usage_limit: usageLimit, per_customer_limit: perCustomerLimit, is_active: body.is_active !== false } };
}

export async function GET(req) {
  try {
    const auth = await guard(req, "get");
    if (auth.error) return auth.error;
    const { data, error } = await supabaseAdmin().from("coupons").select("*").order("created_at", { ascending: false });
    if (error) { console.error("Coupon load failed:", error.message); return fail("Could not load coupons.", 500); }
    return Response.json({ coupons: data || [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { if (error instanceof Response) return error; console.error("Coupons GET failed:", error); return fail("Server error.", 500); }
}

export async function POST(req) {
  try {
    const auth = await guard(req, "post");
    if (auth.error) return auth.error;
    let body; try { body = await req.json(); } catch { return fail("Invalid request body."); }
    const parsed = couponInput(body || {});
    if (parsed.error) return fail(parsed.error);
    const { data, error } = await supabaseAdmin().from("coupons").insert(parsed.value).select("*").single();
    if (error) { console.error("Coupon create failed:", error.message); return fail(error.code === "23505" ? "Coupon code already exists." : "Could not create coupon.", error.code === "23505" ? 409 : 500); }
    return Response.json({ coupon: data }, { status: 201 });
  } catch (error) { if (error instanceof Response) return error; console.error("Coupons POST failed:", error); return fail("Server error.", 500); }
}

export async function PATCH(req) {
  try {
    const auth = await guard(req, "patch");
    if (auth.error) return auth.error;
    let body; try { body = await req.json(); } catch { return fail("Invalid request body."); }
    if (!body?.id || !/^[0-9a-f-]{36}$/i.test(body.id)) return fail("Invalid coupon ID.");
    if (body.action === "toggle") {
      if (typeof body.is_active !== "boolean") return fail("Invalid active state.");
      const { data, error } = await supabaseAdmin().from("coupons").update({ is_active: body.is_active }).eq("id", body.id).select("*").maybeSingle();
      if (error) { console.error("Coupon toggle failed:", error.message); return fail("Could not update coupon.", 500); }
      if (!data) return fail("Coupon not found.", 404);
      return Response.json({ coupon: data });
    }
    const parsed = couponInput(body);
    if (parsed.error) return fail(parsed.error);
    const { data, error } = await supabaseAdmin().from("coupons").update(parsed.value).eq("id", body.id).select("*").maybeSingle();
    if (error) { console.error("Coupon update failed:", error.message); return fail(error.code === "23505" ? "Coupon code already exists." : "Could not update coupon.", error.code === "23505" ? 409 : 500); }
    if (!data) return fail("Coupon not found.", 404);
    return Response.json({ coupon: data });
  } catch (error) { if (error instanceof Response) return error; console.error("Coupons PATCH failed:", error); return fail("Server error.", 500); }
}

export async function DELETE(req) {
  try {
    const auth = await guard(req, "delete");
    if (auth.error) return auth.error;
    const id = new URL(req.url).searchParams.get("id") || "";
    if (!/^[0-9a-f-]{36}$/i.test(id)) return fail("Invalid coupon ID.");
    const { error, count } = await supabaseAdmin().from("coupons").delete({ count: "exact" }).eq("id", id);
    if (error) { console.error("Coupon delete failed:", error.message); return fail("Could not delete coupon.", 500); }
    if (!count) return fail("Coupon not found.", 404);
    return Response.json({ ok: true });
  } catch (error) { if (error instanceof Response) return error; console.error("Coupons DELETE failed:", error); return fail("Server error.", 500); }
}
