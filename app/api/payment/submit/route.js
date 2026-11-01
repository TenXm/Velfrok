import { supabaseAdmin } from "@/lib/supabase";
import { requireUser } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { cleanUtr } from "@/lib/sanitize";

async function verifyCaptcha(token) {
  if (!token || !process.env.HCAPTCHA_SECRET) {
    return false;
  }

  try {
    const response = await fetch("https://api.hcaptcha.com/siteverify", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        secret: process.env.HCAPTCHA_SECRET,
        response: token,
      }),
    });

    if (!response.ok) {
      return false;
    }

    const result = await response.json();
    return result.success === true;
  } catch {
    return false;
  }
}

export async function POST(req) {
  try {
    const { user, error } = await requireUser(req);
    if (error) return error;

    try {
      await rateLimit(`utr:${clientIp(req)}:${user.id}`, 5, 300);
    } catch (rateLimitError) {
      if (rateLimitError instanceof Response) {
        return rateLimitError;
      }

      console.error("UTR rate limit failed:", rateLimitError);

      return Response.json(
        { error: "Unable to process request. Please try again later." },
        { status: 503 }
      );
    }

    let body;

    try {
      body = await req.json();
    } catch {
      return Response.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const { token, utr, captcha } = body || {};

    if (!/^[0-9a-f-]{36}$/i.test(token || "")) {
      return Response.json(
        { error: "Invalid payment token" },
        { status: 400 }
      );
    }

    const transactionId = cleanUtr(utr);

    if (transactionId.length < 6 || transactionId.length > 40) {
      return Response.json(
        { error: "Enter a valid UPI transaction ID (UTR)" },
        { status: 400 }
      );
    }

    const captchaValid = await verifyCaptcha(captcha);

    if (!captchaValid) {
      return Response.json(
        { error: "CAPTCHA failed. Please try again." },
        { status: 400 }
      );
    }

    const db = supabaseAdmin();

    // Payment token must belong to the signed-in user.
    const { data: paymentIntent, error: lookupError } = await db
      .from("payment_intents")
      .select("token,user_id,order_id,status,expires_at")
      .eq("token", token)
      .eq("user_id", user.id)
      .maybeSingle();

    if (lookupError) {
      console.error(
        "Payment intent lookup failed:",
        lookupError.message
      );

      return Response.json(
        { error: "Unable to verify payment page" },
        { status: 500 }
      );
    }

    if (!paymentIntent || paymentIntent.status !== "opened") {
      return Response.json(
        { error: "Invalid or already submitted payment page" },
        { status: 400 }
      );
    }

    // Reject expired payment pages.
    if (
      paymentIntent.expires_at &&
      new Date(paymentIntent.expires_at).getTime() <= Date.now()
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

      return Response.json(
        { error: "Payment page expired. Please place the order again." },
        { status: 400 }
      );
    }

    // Change status only while it is still open.
    const { data: updatedPayment, error: paymentUpdateError } = await db
      .from("payment_intents")
      .update({
        status: "utr_submitted",
        utr: transactionId,
      })
      .eq("token", token)
      .eq("user_id", user.id)
      .eq("status", "opened")
      .select("token")
      .maybeSingle();

    if (paymentUpdateError) {
      console.error(
        "UTR submission failed:",
        paymentUpdateError.message
      );

      return Response.json(
        { error: "Unable to submit UTR. Please try again." },
        { status: 500 }
      );
    }

    if (!updatedPayment) {
      return Response.json(
        { error: "Payment page is no longer open" },
        { status: 409 }
      );
    }

    const { error: orderUpdateError } = await db
      .from("orders")
      .update({ payment_status: "pending_verification" })
      .eq("id", paymentIntent.order_id)
      .eq("user_id", user.id);

    if (orderUpdateError) {
      console.error(
        "Order payment status update failed:",
        orderUpdateError.message
      );

      return Response.json(
        {
          error:
            "UTR was received, but order status could not be updated. Please contact support.",
        },
        { status: 500 }
      );
    }

    return Response.json({
      ok: true,
      message: "Payment submitted for verification",
    });
  } catch (error) {
    if (error instanceof Response) return error;

    console.error("Payment submission error:", error);

    return Response.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}
