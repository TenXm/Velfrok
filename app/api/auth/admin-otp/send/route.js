import { createHmac, randomInt } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { requireUser } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(message, status) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

function sessionIdFromToken(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.session_id === "string" ? payload.session_id : null;
  } catch {
    return null;
  }
}

function hashCode(code, secret) {
  return createHmac("sha256", secret).update(code).digest("hex");
}

export async function POST(req) {
  try {
    const auth = await requireUser(req);
    if (auth.error) return auth.error;

    const { user, token } = auth;
    if (!user.email) return fail("An administrator email address is required.", 400);

    const sessionId = sessionIdFromToken(token);
    if (!sessionId) return fail("Invalid sign-in session. Please sign in again.", 401);

    const { data: admin, error: adminError } = await supabaseAdmin()
      .from("velfrok_admins").select("user_id").eq("user_id", user.id).maybeSingle();
    if (adminError || !admin) return fail("This account is not authorized as an administrator.", 403);

    const secret = process.env.ADMIN_OTP_SECRET;
    const resendKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL;
    if (!secret || Buffer.byteLength(secret) < 32 || !resendKey || !fromEmail) {
      return fail("Administrator email verification is not configured on the server.", 503);
    }

    await rateLimit(`admin-otp-send-user:${user.id}`, 3, 600);
    await rateLimit(`admin-otp-send-ip:${clientIp(req)}`, 10, 600);

    const code = String(randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const db = supabaseAdmin();
    const { error: saveError } = await db.from("admin_email_otp_challenges").upsert({
      user_id: user.id,
      session_id: sessionId,
      otp_hash: hashCode(code, secret),
      expires_at: expiresAt,
      attempts: 0,
      verified_at: null,
      verified_until: null,
      created_at: new Date().toISOString(),
    }, { onConflict: "session_id" });

    if (saveError) {
      console.error("Admin OTP challenge save failed:", saveError.message);
      return fail("Could not prepare the email verification code.", 500);
    }

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromEmail,
        to: [user.email],
        subject: "Your Velfrok admin security code",
        text: `Your Velfrok administrator verification code is ${code}. It expires in 10 minutes. If you did not request this code, secure your account and ignore this email.`,
      }),
      cache: "no-store",
    });

    if (!emailResponse.ok) {
      await db.from("admin_email_otp_challenges").delete().eq("session_id", sessionId).eq("user_id", user.id);
      console.error("Admin OTP email delivery failed:", emailResponse.status);
      return fail("The verification email could not be sent. Please try again later.", 502);
    }

    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Admin OTP send failed:", error);
    return fail("Unable to send the verification code.", 500);
  }
}
