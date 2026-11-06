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

    const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
    const smtpPort = Number(process.env.SMTP_PORT || 465);
    const smtpUser = process.env.SMTP_USER;
    const smtpPassword = process.env.SMTP_PASSWORD;
    const fromEmail = process.env.SMTP_FROM_EMAIL || smtpUser;
    const fromName = process.env.SMTP_FROM_NAME || "Velfrok";

    if (!smtpUser || !smtpPassword || !fromEmail || !Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
      await db.from("admin_email_otp_challenges").delete().eq("id", challenge.id);
      return fail("Admin email delivery is not configured.", 503);
    }

    let transporter;
    try {
      const nodemailer = await import("nodemailer");
      transporter = nodemailer.default.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPassword },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
      });
      await transporter.sendMail({
        from: { name: fromName, address: fromEmail },
        to: email,
        subject: "Your Velfrok Admin sign-in code",
        text: `Your Velfrok Admin verification code is ${code}. It expires in 10 minutes. Do not share this code with anyone.`,
        html: `<h2>Velfrok Admin sign-in</h2><p>Your 6-digit verification code is:</p><h1 style="letter-spacing:6px">${code}</h1><p>This code expires in 10 minutes. Do not share it with anyone.</p>`,
      });
    } catch (deliveryError) {
      await db.from("admin_email_otp_challenges").delete().eq("id", challenge.id);
      console.error("Admin OTP SMTP delivery failed:", deliveryError instanceof Error ? deliveryError.message : "Unknown SMTP error");
      return fail("Could not send the verification email. Please check the SMTP configuration.", 502);
    } finally {
      if (transporter) transporter.close();
    }

    return Response.json({ ok: true, expiresIn: 600 }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Admin OTP send failed:", error);
    return fail("Unable to send the verification code right now.", 500);
  }
}
