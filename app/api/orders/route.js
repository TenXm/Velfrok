import { supabaseAdmin } from "@/lib/supabase";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { clean, cleanPhone } from "@/lib/sanitize";
import { newPaymentToken } from "@/lib/payment-token";

export async function POST(req) {
  try {
    const { user, error } = await requireUser(req);
    if (error) return error;

    await rateLimit(`order:${user.id}`, 5, 600);

    let body;

    try {
      body = await req.json();
    } catch {
      return Response.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    if (!Array.isArray(body.items)) {
      return Response.json(
        { error: "Invalid cart" },
        { status: 400 }
      );
    }

    // Combine repeated SKUs and validate quantities.
    const itemMap = new Map();

    for (const item of body.items) {
      const sku = clean(item?.sku, 40);
      const qty = Number(item?.qty);

      if (!sku || !Number.isInteger(qty) || qty < 1 || qty > 10) {
        return Response.json(
          { error: "Invalid cart item" },
          { status: 400 }
        );
      }

      const combinedQty = (itemMap.get(sku) || 0) + qty;

      if (combinedQty > 10) {
        return Response.json(
          { error: "Maximum quantity per product is 10" },
          { status: 400 }
        );
      }

      itemMap.set(sku, combinedQty);
    }

    const items = [...itemMap.entries()].map(([sku, qty]) => ({
      sku,
      qty,
    }));

    if (!items.length) {
      return Response.json(
        { error: "Cart empty" },
        { status: 400 }
      );
    }

    const address = {
      name: clean(body.name, 80),
      phone: cleanPhone(body.phone),
      line1: clean(body.line1, 200),
      city: clean(body.city, 60),
      pincode: clean(body.pincode, 6),
      state: clean(body.state, 40),
    };

    if (
      !address.name ||
      address.phone.length !== 10 ||
      !/^\d{6}$/.test(address.pincode) ||
      !address.line1 ||
      !address.city ||
      !address.state
    ) {
      return Response.json(
        { error: "Invalid address" },
        { status: 400 }
      );
    }

    const db = supabaseAdmin();

    // Always calculate prices and stock from the database.
    const { data: products, error: productsError } = await db
      .from("products")
      .select("sku,name,selling_price,quantity")
      .in("sku", items.map((item) => item.sku))
      .eq("is_active", true);

    if (productsError) {
      console.error("Product lookup failed:", productsError.message);

      return Response.json(
        { error: "Unable to verify products" },
        { status: 500 }
      );
    }

    const productMap = new Map(
      (products || []).map((product) => [product.sku, product])
    );

    let subtotal = 0;
    const lineItems = [];

    for (const item of items) {
      const product = productMap.get(item.sku);

      if (!product) {
        return Response.json(
          { error: `${item.sku} is unavailable` },
          { status: 409 }
        );
      }

      const price = Number(product.selling_price);
      const stock = Number(product.quantity);

      if (
        !Number.isFinite(price) ||
        price < 0 ||
        !Number.isInteger(stock) ||
        stock < item.qty
      ) {
        return Response.json(
          { error: `${item.sku} is out of stock` },
          { status: 409 }
        );
      }

      subtotal += price * item.qty;

      lineItems.push({
        sku: product.sku,
        name: product.name,
        price,
        qty: item.qty,
      });
    }

    // Validate coupon server-side.
    let discount = 0;
    let couponCode = null;

    if (body.coupon) {
      const code = clean(body.coupon, 20).toUpperCase();

      const { data: coupon, error: couponError } = await db
        .from("coupons")
        .select("code,discount_pct")
        .eq("code", code)
        .eq("is_active", true)
        .gte("expires_at", new Date().toISOString())
        .maybeSingle();

      if (couponError) {
        console.error("Coupon lookup failed:", couponError.message);

        return Response.json(
          { error: "Unable to verify coupon" },
          { status: 500 }
        );
      }

      if (coupon) {
        const discountPct = Number(coupon.discount_pct);

        if (
          Number.isFinite(discountPct) &&
          discountPct >= 0 &&
          discountPct <= 100
        ) {
          discount = Math.round((subtotal * discountPct) / 100);
          couponCode = coupon.code;
        }
      }
    }

    const total = Math.max(0, subtotal - discount);
    const orderCode = `VFK-${Date.now().toString(36).toUpperCase()}`;

    const { data: order, error: orderError } = await db
      .from("orders")
      .insert({
        order_code: orderCode,
        user_id: user.id,
        items: lineItems,
        subtotal_inr: subtotal,
        discount_inr: discount,
        total_inr: total,
        coupon_code: couponCode,
        shipping_address: address,
      })
      .select()
      .single();

    if (orderError || !order) {
      console.error(
        "Order creation failed:",
        orderError?.message || "No order returned"
      );

      return Response.json(
        { error: "Unable to create order" },
        { status: 500 }
      );
    }

    const token = newPaymentToken();

const expiresAt = new Date(
  Date.now() + 20 * 60 * 1000
).toISOString();

const { error: paymentError } = await db
  .from("payment_intents")
  .insert({
    token,
    order_id: order.id,
    user_id: user.id,
    amount_inr: order.total_inr,
    status: "opened",
    expires_at: expiresAt,
  });

    if (paymentError) {
      console.error(
        "Payment intent creation failed:",
        paymentError.message
      );

      return Response.json(
        {
          error: "Order created, but payment setup failed. Please contact support.",
          orderCode: order.order_code,
        },
        { status: 500 }
      );
    }

    return Response.json({
      ok: true,
      orderCode: order.order_code,
      token,
    });
  } catch (error) {
    if (error instanceof Response) return error;

    console.error("Order API error:", error);

    return Response.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}

export async function GET(req) {
  const { user, error } = await requireUser(req);
  if (error) return error;

  const { data, error: queryError } = await supabaseAdmin()
    .from("orders")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (queryError) {
    console.error("Order history lookup failed:", queryError.message);

    return Response.json(
      { error: "Unable to load orders" },
      { status: 500 }
    );
  }

  return Response.json({ orders: data || [] });
}
