import { supabaseAdmin } from "@/lib/supabase";
import { requireUser } from "@/lib/auth";

export async function GET(req) {
  try {
    const { user, error } = await requireUser(req);
    if (error) return error;

    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    if (!/^[0-9a-f-]{36}$/i.test(token || "")) {
      return Response.json(
        { error: "Invalid payment token" },
        { status: 400 }
      );
    }

    const db = supabaseAdmin();

    const { data: payment, error: lookupError } = await db
      .from("payment_intents")
      .select("token,user_id,order_id,status,amount_inr,expires_at")
      .eq("token", token)
      .eq("user_id", user.id)
      .maybeSingle();

    if (lookupError) {
      console.error(
        "Payment status lookup failed:",
        lookupError.message
      );

      return Response.json(
        { error: "Unable to check payment status" },
        { status: 500 }
      );
    }

    if (!payment) {
      return Response.json(
        { error: "Payment page not found" },
        { status: 404 }
      );
    }

    let status = payment.status;

    if (
      status === "opened" &&
      payment.expires_at &&
      new Date(payment.expires_at).getTime() <= Date.now()
    ) {
      const { error: expireError } = await db
        .from("payment_intents")
        .update({ status: "abandoned" })
        .eq("token", token)
        .eq("user_id", user.id)
        .eq("status", "opened");

      if (expireError) {
        console.error(
          "Payment expiry update failed:",
          expireError.message
        );
      }

      status = "expired";
    }

    return Response.json(
      {
        status,
        amount: Number(payment.amount_inr),
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    if (error instanceof Response) return error;

    console.error("Payment status API error:", error);

    return Response.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}
