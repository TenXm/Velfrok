
import { requireUser, supabaseForUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { clean, cleanPhone } from "@/lib/sanitize";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function responseError(message, status) {
  return Response.json({ error: message }, { status });
}

export async function POST(req) {
  try {
    const { user, error } = await requireUser(req);
    if (error) return error;

    if (!user.email || !user.email_confirmed_at) {
      return responseError(
        "Please verify your email before placing an order.",
        403
      );
    }

    await rateLimit(`order:${user.id}`, 5, 600);

    let body;

    try {
      body = await req.json();
    } catch {
      return responseError("Invalid request body.", 400);
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return responseError("Invalid order details.", 400);
    }

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return responseError("Your cart is empty.", 400);
    }

    if (body.items.length > 30) {
      return responseError("Too many items in your cart.", 400);
    }

    // Coupons are deliberately disabled until their database
    // validation and usage limits are implemented atomically.
    if (
      typeof body.coupon === "string" &&
      body.coupon.trim().length > 0
    ) {
      return responseError(
        "Coupons are temporarily unavailable. Please continue without a coupon.",
        400
      );
    }

    // Accept product UUIDs or SKUs as identifiers.
    // Neither identifier nor any client-supplied price is trusted.
    const requestedItems = [];
    const requestedSkus = [];

    for (const item of body.items) {
      if (!item || typeof item !== "object") {
        return responseError("Invalid cart item.", 400);
      }

      const quantity = Number(item.quantity ?? item.qty);

      if (
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 10
      ) {
        return responseError(
          "Each product quantity must be between 1 and 10.",
          400
        );
      }

      const productId =
        item.product_id ?? item.productId ?? item.id;

      if (typeof productId === "string" && UUID_PATTERN.test(productId)) {
        requestedItems.push({
          productId: productId.toLowerCase(),
          quantity,
        });
        continue;
      }

      const sku = clean(item.sku, 40);

      if (!sku) {
        return responseError("Invalid product identifier.", 400);
      }

      requestedSkus.push({ sku, quantity });
    }

    const db = supabaseForUser(req);

    // Resolve SKU identifiers to database product UUIDs.
    // RLS limits this lookup to publicly readable active products.
    if (requestedSkus.length > 0) {
      const uniqueSkus = [
        ...new Set(requestedSkus.map((item) => item.sku)),
      ];

      const { data: products, error: productError } = await db
        .from("products")
        .select("id,sku")
        .in("sku", uniqueSkus)
        .eq("is_active", true);

      if (productError) {
        console.error("Product identifier lookup failed:", productError.message);
        return responseError("Unable to verify cart products.", 500);
      }

      const productIdsBySku = new Map(
        (products || []).map((product) => [product.sku, product.id])
      );

      for (const item of requestedSkus) {
        const productId = productIdsBySku.get(item.sku);

        if (!productId) {
          return responseError(
            `A product in your cart is unavailable: ${item.sku}`,
            409
          );
        }

        requestedItems.push({
          productId,
          quantity: item.quantity,
        });
      }
    }

    // Combine duplicate product IDs before calling the database.
    const combined = new Map();

    for (const item of requestedItems) {
      const quantity =
        (combined.get(item.productId) || 0) + item.quantity;

      if (quantity > 10) {
        return responseError(
          "Maximum quantity per product is 10.",
          400
        );
      }

      combined.set(item.productId, quantity);
    }

    const rpcItems = [...combined.entries()]
      .map(([product_id, quantity]) => ({
        product_id,
        quantity,
      }))
      .sort((a, b) => a.product_id.localeCompare(b.product_id));

    if (rpcItems.length === 0) {
      return responseError("Your cart is empty.", 400);
    }

    const name = clean(body.name, 80);
    const mobile = cleanPhone(body.phone);
    const address = clean(body.line1 ?? body.address, 200);
    const city = clean(body.city, 60);
    const state = clean(body.state, 40);
    const pincode = clean(body.pincode, 6);

    if (
      !name ||
      mobile.length !== 10 ||
      !address ||
      !city ||
      !state ||
      !/^[0-9]{6}$/.test(pincode)
    ) {
      return responseError(
        "Please enter a valid name, 10-digit mobile number and complete shipping address.",
        400
      );
    }

    // Use the verified account email, never an unverified email
    // supplied by the browser.
    const suppliedEmail =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "";

    if (suppliedEmail && suppliedEmail !== user.email.toLowerCase()) {
      return responseError(
        "Checkout email must match your verified email address.",
        400
      );
    }

    // This database function performs the order insert, item inserts,
    // stock locks and stock deduction in one database transaction.
    const { data: orderId, error: orderError } = await db.rpc(
      "place_order_atomic",
      {
        p_customer_name: name,
        p_mobile: mobile,
        p_email: user.email,
        p_address: address,
        p_city: city,
        p_state: state,
        p_pincode: pincode,
        p_items: rpcItems,
        p_coupon_code: null,
      }
    );

    if (orderError || !orderId) {
      console.error(
        "Atomic order creation failed:",
        orderError?.message || "No order ID returned"
      );

      const message = orderError?.message || "";

      if (/stock|unavailable|insufficient/i.test(message)) {
        return responseError(
          "One or more products are no longer available in the requested quantity.",
          409
        );
      }

      if (/invalid|quantity|cart|address|signed in|email/i.test(message)) {
        return responseError(
          "Please check your order and shipping details.",
          400
        );
      }

      return responseError(
        "We could not create your order. Please try again later.",
        500
      );
    }

    // Read the new order using the customer's own JWT and RLS.
    const { data: order, error: lookupError } = await db
      .from("orders")
      .select(
        "id,order_number,subtotal,discount_amount,total_amount,payment_status,created_at"
      )
      .eq("id", orderId)
      .eq("user_id", user.id)
      .maybeSingle();

    // The RPC already committed the order. Never tell the customer
    // to retry order creation just because this follow-up read failed.
    if (lookupError || !order) {
      console.error(
        "Created order could not be read:",
        lookupError?.message || "Order lookup returned no row",
        orderId
      );

      return Response.json(
        {
          ok: true,
          orderId,
          message:
            "Your order was created. Please refresh your order history to view its details.",
        },
        { status: 201, headers: { "Cache-Control": "no-store" } }
      );
    }

    return Response.json(
      {
        ok: true,
        order,
        message: "Order created successfully.",
      },
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    if (error instanceof Response) return error;

    console.error("Order API error:", error);

    return responseError(
      "Unable to process your order right now. Please try again later.",
      500
    );
  }
}

export async function GET(req) {
  try {
    const { user, error } = await requireUser(req);
    if (error) return error;

    const db = supabaseForUser(req);

    const { data, error: queryError } = await db
      .from("orders")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (queryError) {
      console.error("Order history lookup failed:", queryError.message);
      return responseError("Unable to load your orders.", 500);
    }

    return Response.json(
      { orders: data || [] },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof Response) return error;

    console.error("Order history API error:", error);
    return responseError("Unable to load your orders.", 500);
  }
}
