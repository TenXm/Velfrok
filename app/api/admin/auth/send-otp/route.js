import { createHmac, randomInt, randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

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

function base64Url(value) {
  return Buffer.from(value, "utf8").toString("base64")
    .replace(/\\+/g, "-")
    .replace(/\\//g, "_")
    .replace(/=+$/g, "");
}

async function sendAdminOtpWithGmailApi({ to, code }) {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  const fromEmail = process.env.GMAIL_FROM_EMAIL;

  if (!clientId || !clientSecret || !refreshToken || !fromEmail) {
    throw new Error("Gmail API environment variables are missing.");
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });

  if (!tokenResponse.ok) {
    throw new Error(`Gmail OAuth token request failed (HTTP ${tokenResponse.status}).`);
  }

  const tokenData = await tokenResponse.json();
  if (!tokenData.access_token) {
    throw new Error("Gmail OAuth response did not include an access token.");
  }

  const boundary = `velfrok-${randomUUID()}`;
  const subject = "Your Velfrok Admin sign-in code";
  const text = `Your Velfrok Admin verification code is ${code}. It expires in 10 minutes. Do not share this code with anyone.`;
  const html = `<h2>Velfrok Admin sign-in</h2><p>Your 6-digit verification code is:</p><h1 style="letter-spacing:6px">${code}</h1><p>This code expires in 10 minutes. Do not share it with anyone.</p>`;
  const mime = [
    `From: Velfrok <${fromEmail}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    text,
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
    `--${boundary}--`,
    "",
  ].join("\\r\\n");

  const sendResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: base64Url(mime) }),
    cache: "no-store",
  });

  if (!sendResponse.ok) {
    throw new Error(`Gmail API send request failed (HTTP ${sendResponse.status}).`);
  }
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

    // Atomic per-account limits: one code per minute and five per day.
    await rateLimit(`admin-otp-minute:${user.id}`, 1, 60);
    await rateLimit(`admin-otp-daily:${user.id}`, 5, 86400);
    const now = Date.now();

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
        id: randomUUID(),
        user_id: user.id,
        session_id: sessionId,
        otp_hash: hashOtp(code),
        expires_at: new Date(now + 10 * 60 * 1000).toISOString(),
        attempts: 0,
        created_at: new Date(now).toISOString(),
      })
      .select("id")
      .single();

    if (insertError || !challenge) {
      console.error("Admin OTP creation failed:", insertError?.message);
      return fail("Could not start verification. Please try again.", 503);
    }

    try {
      await sendAdminOtpWithGmailApi({ to: email, code });
    } catch (deliveryError) {
      await db.from("admin_email_otp_challenges").delete().eq("id", challenge.id);
      console.error(
        "Admin OTP Gmail API delivery failed:",
        deliveryError instanceof Error ? deliveryError.message : "Unknown Gmail API error"
      );
      return fail("Could not send the verification email. Please check the Gmail API configuration.", 502);
    }

    return Response.json({ ok: true, expiresIn: 600 }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Admin OTP send failed:", error);
    return fail("Unable to send the verification code right now.", 500);
  }
}
