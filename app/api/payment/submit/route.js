
import { requireUser, supabaseForUser } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { cleanUtr } from "@/lib/sanitize";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function verifyCaptcha(token) {
  if (
    typeof token !== "string" ||
    !token ||
    !process.env.HCAPTCHA_SECRET
  ) {
    return false;
  }

  try {
    const response = await fetch(
      "https://api.hcaptcha.com/siteverify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          secret: process.env.HCAPTCHA_SECRET,
          response: token,
        }),
      }
    );

    if (!response.ok) return false;

    const result = await response.json();
    return result.success === true;
  } catch {
    return false;
  }
}

function fail(message, status) {
  return Response.json({ error: message }, { status });
}

export async function POST(req) {
  try {
    const { user, error } = await requireUser(req);
    if (error) return error;

    if (!user.email || !user.email_confirmed_at) {
      return fail("Please verify your email first.", 403);
    }

    try {
      await rateLimit(
        `utr:${clientIp(req)}:${user.id}`,
        5,
        300
      );
    } catch (rateLimitError) {
      if (rateLimitError instanceof Response) {
        return rateLimitError;
      }

      console.error("UTR rate limit failed:", rateLimitError);

      return fail(
        "Unable to process your request. Please try again later.",
        503
      );
    }

    let body;

    try {
      body = await req.json();
    } catch {
      return fail("Invalid request body.", 400);
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return fail("Invalid request details.", 400);
    }

    const orderId =
      typeof body.orderId === "string"
        ? body.orderId.trim()
        : "";

    if (!UUID_PATTERN.test(orderId)) {
      return fail("Invalid order ID.", 400);
    }

    const utr = cleanUtr(body.utr);

    if (!/^[0-9]{12}$/.test(utr)) {
      return fail("UTR must contain exactly 12 digits.", 400);
    }

    const captchaValid = await verifyCaptcha(body.captcha);

    if (!captchaValid) {
      return fail("CAPTCHA verification failed.", 400);
    }

    // The database function verifies ownership, order status,
    // UTR format and the transition atomically.
    const db = supabaseForUser(req);

    const { data, error: rpcError } = await db.rpc(
      "submit_order_utr",
      {
        p_order_id: orderId,
        p_utr_number: utr,
      }
    );

    if (rpcError) {
      console.error("UTR submission RPC failed:", rpcError.message);

      return fail(
        "UTR could not be submitted. Check the order status and try again.",
        409
      );
    }

    if (data !== true) {
      return fail("UTR submission was not confirmed.", 409);
    }

    return Response.json(
      {
        ok: true,
        message: "UTR submitted for payment verification.",
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    if (error instanceof Response) return error;

    console.error("UTR submission error:", error);
    return fail("Server error.", 500);
  }
}
