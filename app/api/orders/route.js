import { requireUser, supabaseForUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";
import { clean } from "@/lib/sanitize";
import { validateCoupon } from "@/lib/coupons";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function responseError(message, status) { return Response.json({ error: message }, { status }); }

export async function POST(req) {
  try {
    const { user, error } = await requireUser(req);
    if (error) return error;
    if (!user.email || !user.email_confirmed_at) return responseError("Please verify your email before placing an order.", 403);
    await rateLimit(`order:${user.id}`, 5, 600);
    let body;
    try { body = await req.json(); } catch { return responseError("Invalid request body.", 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return responseError("Invalid order details.", 400);
    if (!Array.isArray(body.items) || !body.items.length) return responseError("Your cart is empty.", 400);
    if (body.items.length > 30) return responseError("Too many items in your cart.", 400);

    const paymentMethod = body.paymentMethod;
    if (!["upi", "cod"].includes(paymentMethod)) return responseError("Choose a valid payment method.", 400);
    if (paymentMethod === "cod") {
      if (process.env.COD_ENABLED !== "true") return responseError("Cash on Delivery is currently unavailable.", 403);
      const { data: flag, error: flagError } = await supabaseAdmin().from("store_feature_flags").select("enabled").eq("flag_key", "cod_enabled").maybeSingle();
      if (flagError || flag?.enabled !== true) return responseError("Cash on Delivery is currently unavailable.", 403);
    }

    const requestedItems = [], requestedSkus = [];
    for (const item of body.items) {
      if (!item || typeof item !== "object") return responseError("Invalid cart item.", 400);
      const quantity = Number(item.quantity ?? item.qty);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) return responseError("Each product quantity must be between 1 and 10.", 400);
      const productId = item.product_id ?? item.productId ?? item.id;
      const rawOptions = item.options && typeof item.options === "object" && !Array.isArray(item.options) ? item.options : {};
      const optionEntries = Object.entries(rawOptions);
      if (optionEntries.length > 12 || optionEntries.some(([key, value]) => typeof key !== "string" || !key.trim() || key.length > 40 || typeof value !== "string" || !value.trim() || value.length > 80)) return responseError("Invalid product options.", 400);
      const options = Object.fromEntries(optionEntries.map(([key, value]) => [key.trim(), value.trim()]));
      if (typeof productId === "string" && UUID_PATTERN.test(productId)) requestedItems.push({ productId: productId.toLowerCase(), quantity, options });
      else {
        const sku = clean(item.sku, 40);
        if (!sku) return responseError("Invalid product identifier.", 400);
        requestedSkus.push({ sku, quantity, options });
      }
    }

    const db = supabaseForUser(req);
    if (requestedSkus.length) {
      const uniqueSkus = [...new Set(requestedSkus.map(item => item.sku))];
      const { data: products, error: productError } = await db.from("products").select("id,sku").in("sku", uniqueSkus).eq("is_active", true);
      if (productError) { console.error("Product identifier lookup failed:", productError.message); return responseError("Unable to verify cart products.", 500); }
      const bySku = new Map((products || []).map(product => [product.sku, product.id]));
      for (const item of requestedSkus) {
        const productId = bySku.get(item.sku);
        if (!productId) return responseError("A product in your cart is unavailable.", 409);
        requestedItems.push({ productId, quantity: item.quantity });
      }
    }
    const combined = new Map();
    const productQuantities = new Map();
    for (const item of requestedItems) {
      const variantKey = JSON.stringify(item.options, Object.keys(item.options).sort());
      const key = `${item.productId}:${variantKey}`;
      const quantity = (combined.get(key)?.quantity || 0) + item.quantity;
      if (quantity > 10) return responseError("Maximum quantity per product variant is 10.", 400);
      combined.set(key, { productId: item.productId, quantity, options: item.options });
      const productTotal = (productQuantities.get(item.productId) || 0) + item.quantity;
      if (productTotal > 10) return responseError("Maximum quantity per product is 10.", 400);
      productQuantities.set(item.productId, productTotal);
    }
    const rpcItems = [...combined.values()].map(item => ({
      product_id: item.productId, quantity: item.quantity, options: item.options,
    })).sort((a,b) => a.product_id.localeCompare(b.product_id) || JSON.stringify(a.options).localeCompare(JSON.stringify(b.options)));
    if (!rpcItems.length) return responseError("Your cart is empty.", 400);

    const couponCode = typeof body.coupon === "string" ? body.coupon.trim() : "";
    if (couponCode) {
      const couponResult = await validateCoupon({
        db, userId: user.id, code: couponCode,
        items: rpcItems.map((item) => ({ productId: item.product_id, quantity: item.quantity })),
      });
      if (couponResult.error) return responseError(couponResult.error, couponResult.status || 400);
    }

    const name = clean(body.name, 80);
    const rawMobile = typeof body.phone === "string" ? body.phone.trim() : "";
    const mobile = rawMobile;
    const address = clean(body.line1 ?? body.address, 200), city = clean(body.city, 60);
    const state = clean(body.state, 40), pincode = clean(body.pincode, 6);
    if (!name || !/^[0-9]{10}$/.test(rawMobile) || !address || !city || !state || !/^[0-9]{6}$/.test(pincode)) return responseError("All delivery fields are required. Enter exactly 10 digits for mobile and exactly 6 digits for PIN code.", 400);
    const suppliedEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (suppliedEmail && suppliedEmail !== user.email.toLowerCase()) return responseError("Checkout email must match your verified email address.", 400);

    const { data: orderId, error: orderError } = await db.rpc("place_order_atomic", {
      p_customer_name: name, p_mobile: mobile, p_email: user.email, p_address: address,
      p_city: city, p_state: state, p_pincode: pincode, p_items: rpcItems,
      p_payment_method: paymentMethod, p_coupon_code: couponCode || null,
    });
    if (orderError || !orderId) {
      console.error("Atomic order creation failed:", orderError?.message || "No order ID returned");
      const message = orderError?.message || "";
      if (/stock|unavailable|insufficient/i.test(message)) return responseError("One or more products are no longer available in the requested quantity.", 409);
      if (/invalid|quantity|cart|address|signed in|email|COD|coupon|discount|minimum|usage|expired/i.test(message)) return responseError("Please check your order and shipping details.", 400);
      return responseError("We could not create your order. Please try again later.", 500);
    }
    const { data: order, error: lookupError } = await db.from("orders")
      .select("id,order_number,subtotal,discount_amount,total_amount,payment_method,payment_status,order_acceptance_status,fulfillment_status,created_at")
      .eq("id", orderId).eq("user_id", user.id).maybeSingle();
    if (lookupError || !order) {
      console.error("Created order could not be read:", lookupError?.message || "No row", orderId);
      return Response.json({ ok: true, orderId, paymentMethod, message: "Your order was created. Refresh your order history to view details." }, { status: 201, headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ ok: true, order, message: "Order created successfully." }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Order API error:", error);
    return responseError("Unable to process your order right now. Please try again later.", 500);
  }
}

export async function GET(req) {
  try {
    const { user, error } = await requireUser(req);
    if (error) return error;
    const db = supabaseForUser(req);
    const { data, error: queryError } = await db.from("orders").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100);
    if (queryError) { console.error("Order history lookup failed:", queryError.message); return responseError("Unable to load your orders.", 500); }
    return Response.json({ orders: data || [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Order history API error:", error);
    return responseError("Unable to load your orders.", 500);
  }
}