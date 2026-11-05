import { createHmac } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (error, status) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

function claims(token) {
  try { return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")); }
  catch { return null; }
}

export async function POST(req) {
  try {
    const auth = await requireUser(req);
    if (auth.error) return auth.error;
    const sessionId = claims(auth.token)?.session_id;
    if (!sessionId) return fail("Please sign in again.", 401);

    let body;
    try { body = await req.json(); } catch { return fail("Invalid request.", 400); }
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    if (!/^\d{6}$/.test(code)) return fail("Enter the 6-digit email code.", 400);

    const db = supabaseAdmin();
    const { data: admin, error: adminError } = await db.from("velfrok_admins")
      .select("user_id").eq("user_id", auth.user.id).eq("role", "admin").maybeSingle();
    if (adminError || !admin) return fail("Administrator access required.", 403);

    // Enforce a session-scoped limit independently of the database attempt counter.
    await rateLimit(`admin-otp-verify:${auth.user.id}:${sessionId}`, 5, 600);

    const { data: challenge, error } = await db.from("admin_email_otp_challenges")
      .select("id,attempts,expires_at,verified_at").eq("user_id", auth.user.id)
      .eq("session_id", sessionId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) return fail("Verification is temporarily unavailable.", 503);
    if (!challenge || challenge.verified_at || Date.parse(challenge.expires_at) <= Date.now())
      return fail("Code expired. Sign in again to request another.", 401);
    if (challenge.attempts >= 5) return fail("Too many attempts. Sign in again later.", 429);

    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secret) return fail("Server configuration missing.", 503);
    const otpHash = createHmac("sha256", secret).update(code).digest("hex");
    const { data: consumed, error: consumeError } = await db.rpc("admin_email_otp_consume", {
      p_user_id: auth.user.id, p_session_id: sessionId, p_otp_hash: otpHash
    });
    if (consumeError) return fail("Verification is temporarily unavailable.", 503);

    if (consumed !== true) {
      const { data: nextAttempts, error: attemptError } = await db.rpc("admin_email_otp_increment_attempt", {
        p_user_id: auth.user.id, p_session_id: sessionId
      });
      if (attemptError) {
        console.error("Admin OTP attempt counter failed:", attemptError.message);
        return fail("Verification is temporarily unavailable. Please try again.", 503);
      }
      if (!Number.isInteger(nextAttempts)) return fail("Too many attempts. Sign in again later.", 429);
      return fail("Incorrect or expired code.", 401);
    }
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Admin OTP verification failed:", error);
    return fail("Unable to verify the code right now.", 500);
  }
}
