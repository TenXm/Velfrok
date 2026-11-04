import { createHmac, randomInt } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(message, status) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

function sessionIdFromToken(token) {
  try {
    const part = token.split(".")[1];
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")).session_id || null;
  } catch {
    return null;
  }
}

function hashOtp(code) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Server authentication configuration is missing.");
  return createHmac("sha256", secret).update(code).digest("hex");
}

export async function POST(req) {
  try {
    const auth = await requireUser(req);
    if (auth.error) return auth.error;

    const { user, token } = auth;
    const sessionId = sessionIdFromToken(token);
    if (!sessionId) return fail("Please sign in again to continue.", 401);

    let body;
    try { body = await req.json(); } catch { return fail("Invalid request.", 400); }
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || email !== (user.email || "").toLowerCase()) {
      return fail("Use the email address registered to this administrator account.", 400);
    }

    const db = supabaseAdmin();
    const { data: admin, error: adminError } = await db
      .from("velfrok_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (adminError) {
      console.error("Admin membership lookup failed:", adminError.message);
      return fail("Administrator verification is temporarily unavailable.", 503);
    }
    if (!admin) return fail("This account is not authorized as an administrator.", 403);

    const now = Date.now();
    const { count, error: countError } = await db
      .from("admin_email_otp_challenges")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", new Date(now - 24 * 60 * 60 * 1000).toISOString());

    if (countError) {
      console.error("Admin OTP rate lookup failed:", countError.message);
      return fail("Verification is temporarily unavailable.", 503);
    }
    if ((count || 0) >= 5) return fail("Daily verification limit reached. Try again later.", 429);

    const { data: recent, error: recentError } = await db
      .from("admin_email_otp_challenges")
      .select("created_at")
      .eq("user_id", user.id)
      .gte("created_at", new Date(now - 60 * 1000).toISOString())
      .limit(1);

    if (recentError) {
      console.error("Admin OTP cooldown lookup failed:", recentError.message);
      return fail("Verification is temporarily unavailable.", 503);
    }
    if (recent?.length) return fail("Please wait one minute before requesting another code.", 429);

    const code = String(randomInt(100000, 1000000));
    const { error: deleteError } = await db
      .from("admin_email_otp_challenges")
      .delete()
      .eq("user_id", user.id)
      .eq("session_id", sessionId);

    if (deleteError) {
      console.error("Previous OTP cleanup failed:", deleteError.message);
      return fail("Could not start verification. Please try again.", 503);
    }

    const { data: challenge, error: insertError } = await db
      .from("admin_email_otp_challenges")
      .insert({
        user_id: user.id,
        session_id: sessionId,
        otp_hash: hashOtp(code),
        expires_at: new Date(now + 10 * 60 * 1000).toISOString(),
        attempts: 0,
      })
      .select("id")
      .single();

    if (insertError || !challenge) {
      console.error("Admin OTP creation failed:", insertError?.message);
      return fail("Could not start verification. Please try again.", 503);
    }

    const resendKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL;
    if (!resendKey || !fromEmail) {
      await db.from("admin_email_otp_challenges").delete().eq("id", challenge.id);
      return fail("Admin email delivery is not configured.", 503);
    }

    const delivery = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromEmail,
        to: [email],
        subject: "Your Velfrok Admin sign-in code",
        text: `Your Velfrok Admin verification code is ${code}. It expires in 10 minutes. Do not share this code with anyone.`,
      }),
      cache: "no-store",
    });

    if (!delivery.ok) {
      await db.from("admin_email_otp_challenges").delete().eq("id", challenge.id);
      console.error("Admin OTP email delivery failed:", delivery.status);
      return fail("Could not send the verification email. Please try again.", 502);
    }

    return Response.json({ ok: true, expiresIn: 600 }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Admin OTP send failed:", error);
    return fail("Unable to send the verification code right now.", 500);
  }
}
