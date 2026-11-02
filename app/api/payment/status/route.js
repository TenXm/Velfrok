
import { requireUser, supabaseForUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

function fail(message, status) {
  return Response.json({ error: message }, { status });
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(req) {
  try {
    const { user, error } = await requireUser(req);
    if (error) return error;

    try {
      await rateLimit(`payment-status:${user.id}`, 60, 60);
    } catch (rateLimitError) {
      if (rateLimitError instanceof Response) return rateLimitError;

      console.error("Payment status rate limit failed:", rateLimitError);
      return fail("Unable to check payment status right now.", 503);
    }

    const url = new URL(req.url);
    const orderId = url.searchParams.get("orderId")?.trim() || "";

    if (!UUID_PATTERN.test(orderId)) {
      return fail("Invalid order ID.", 400);
    }

    const db = supabaseForUser(req);

    const { data: order, error: lookupError } = await db
      .from("orders")
      .select(
        "id, order_number, total_amount, payment_status, fulfillment_status, created_at"
      )
      .eq("id", orderId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (lookupError) {
      console.error("Payment status lookup failed:", lookupError.message);
      return fail("Unable to retrieve order status.", 500);
    }

    if (!order) {
      return fail("Order not found.", 404);
    }

    return Response.json(
      {
        orderId: order.id,
        orderNumber: order.order_number,
        amount: Number(order.total_amount),
        paymentStatus: order.payment_status,
        fulfillmentStatus: order.fulfillment_status,
        createdAt: order.created_at,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    if (error instanceof Response) return error;

    console.error("Payment status error:", error);
    return fail("Server error.", 500);
  }
}
