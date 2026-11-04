import { supabaseAdmin } from "@/lib/supabase";

const CODE_PATTERN = /^[A-Z0-9_-]{3,40}$/;

export async function validateCoupon({ db, userId, code, items }) {
  const normalizedCode = typeof code === "string" ? code.trim().toUpperCase().replace(/\s+/g, "") : "";
  if (!normalizedCode || !CODE_PATTERN.test(normalizedCode)) {
    return { error: "Enter a valid coupon code.", status: 400 };
  }
  if (!Array.isArray(items) || !items.length || items.length > 30) {
    return { error: "Your cart is empty or invalid.", status: 400 };
  }

  const quantities = new Map();
  for (const item of items) {
    if (!item || typeof item.productId !== "string" || !/^[0-9a-f-]{36}$/i.test(item.productId) ||
        !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10) {
      return { error: "Your cart contains an invalid item.", status: 400 };
    }
    quantities.set(item.productId, (quantities.get(item.productId) || 0) + item.quantity);
  }
  if ([...quantities.values()].some((quantity) => quantity > 10)) {
    return { error: "Maximum quantity per product is 10.", status: 400 };
  }

  const productIds = [...quantities.keys()];
  const [{ data: products, error: productError }, { data: coupon, error: couponError }] = await Promise.all([
    db.from("products").select("id,selling_price,is_active,quantity").in("id", productIds),
    supabaseAdmin().from("coupons").select("id,code,discount_type,discount_value,min_order_value,max_discount,expires_at,usage_limit,per_customer_limit,usage_count,is_active").eq("code", normalizedCode).maybeSingle(),
  ]);
  if (productError || couponError) {
    console.error("Coupon validation lookup failed:", productError?.message || couponError?.message);
    return { error: "Coupon validation is temporarily unavailable. Please try again.", status: 503 };
  }
  if (!coupon || coupon.is_active !== true) return { error: "This coupon is invalid or inactive.", status: 404 };
  if (coupon.expires_at && new Date(coupon.expires_at).getTime() <= Date.now()) return { error: "This coupon has expired.", status: 400 };
  if (coupon.usage_limit != null && Number(coupon.usage_count || 0) >= Number(coupon.usage_limit)) return { error: "This coupon has reached its usage limit.", status: 409 };

  const byId = new Map((products || []).map((product) => [product.id, product]));
  let subtotal = 0;
  for (const [id, quantity] of quantities) {
    const product = byId.get(id);
    if (!product || product.is_active !== true) return { error: "A product in your cart is no longer available.", status: 409 };
    const price = Number(product.selling_price);
    if (!Number.isFinite(price) || price <= 0) return { error: "A product price could not be verified.", status: 503 };
    subtotal += price * quantity;
  }
  if (subtotal < Number(coupon.min_order_value || 0)) {
    return { error: `Add items worth ₹${(Number(coupon.min_order_value) - subtotal).toFixed(2)} more to use this coupon.`, status: 400 };
  }

  if (coupon.per_customer_limit != null) {
    const { count, error: usageError } = await db.from("orders").select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("coupon_code", normalizedCode);
    if (usageError) {
      console.error("Customer coupon usage lookup failed:", usageError.message);
      return { error: "Could not verify this coupon's customer usage limit.", status: 503 };
    }
    if ((count || 0) >= Number(coupon.per_customer_limit)) return { error: "You have already used this coupon the maximum number of times.", status: 409 };
  }

  let discount = coupon.discount_type === "percentage"
    ? subtotal * Number(coupon.discount_value) / 100
    : Number(coupon.discount_value);
  if (coupon.max_discount != null) discount = Math.min(discount, Number(coupon.max_discount));
  discount = Math.min(subtotal, Math.max(0, Math.round((discount + Number.EPSILON) * 100) / 100));
  return { couponCode: normalizedCode, subtotal: Math.round(subtotal * 100) / 100, discountAmount: discount, payable: Math.round((subtotal - discount) * 100) / 100 };
}
