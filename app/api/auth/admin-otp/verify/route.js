import { createHmac, timingSafeEqual } from "crypto";
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

function safeEqual(left, right) {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req) {
  try {
    const auth = await requireUser(req);
    if (auth.error) return auth.error;

    const { user, token } = auth;
    const sessionId = sessionIdFromToken(token);
    if (!sessionId) return fail("Invalid sign-in session. Please sign in again.", 401);

    const { data: admin, error: adminError } = await supabaseAdmin()
      .from("velfrok_admins").select("user_id").eq("user_id", user.id).maybeSingle();
    if (adminError || !admin) return fail("This account is not authorized as an administrator.", 403);

    const body = await req.json().catch(() => null);
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    if (!/^\d{6}$/.test(code)) return fail("Enter the 6-digit email security code.", 400);

    await rateLimit(`admin-otp-verify-user:${user.id}`, 10, 600);
    await rateLimit(`admin-otp-verify-ip:${clientIp(req)}`, 30, 600);

    const secret = process.env.ADMIN_OTP_SECRET;
    if (!secret || Buffer.byteLength(secret) < 32) return fail("Administrator email verification is not configured.", 503);

    const db = supabaseAdmin();
    const { data: challenge, error: challengeError } = await db
      .from("admin_email_otp_challenges")
      .select("id,otp_hash,expires_at,attempts,verified_at,verified_until")
      .eq("user_id", user.id)
      .eq("session_id", sessionId)
      .maybeSingle();

    if (challengeError || !challenge) return fail("No active verification code was found. Request a new code.", 400);
    if (challenge.verified_at && challenge.verified_until && new Date(challenge.verified_until).getTime() > Date.now()) {
      return Response.json({ ok: true, alreadyVerified: true }, { headers: { "Cache-Control": "no-store" } });
    }
    if (!challenge.otp_hash || new Date(challenge.expires_at).getTime() <= Date.now()) {
      return fail("This code has expired. Request a new one.", 400);
    }
    if (challenge.attempts >= 5) return fail("Too many incorrect attempts. Request a new code.", 429);

    const expected = hashCode(code, secret);
    if (!safeEqual(expected, challenge.otp_hash)) {
      const nextAttempts = challenge.attempts + 1;
      await db.from("admin_email_otp_challenges").update({ attempts: nextAttempts }).eq("id", challenge.id).lt("attempts", 5);
      return fail(nextAttempts >= 5 ? "Too many incorrect attempts. Request a new code." : "Incorrect verification code.", 400);
    }

    const verifiedAt = new Date();
    const { error: updateError } = await db.from("admin_email_otp_challenges")
      .update({
        otp_hash: null,
        verified_at: verifiedAt.toISOString(),
        verified_until: new Date(verifiedAt.getTime() + 8 * 60 * 60 * 1000).toISOString(),
      })
      .eq("id", challenge.id)
      .lt("attempts", 5);

    if (updateError) {
      console.error("Admin OTP verification update failed:", updateError.message);
      return fail("Could not complete email verification.", 500);
    }

    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Admin OTP verify failed:", error);
    return fail("Unable to verify the email code.", 500);
  }
}
