import { Webhook } from "standardwebhooks";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const hookSecret = process.env.SEND_EMAIL_HOOK_SECRET;
    const resendKey = process.env.RESEND_API_KEY;
    const testRecipient = process.env.RESEND_TEST_RECIPIENT;
    const fromEmail =
      process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

    if (!hookSecret || !resendKey || !testRecipient) {
      return Response.json(
        { error: "Server configuration missing." },
        { status: 500 }
      );
    }

    const payload = await req.text();
    const headers = Object.fromEntries(req.headers.entries());

    const secret = hookSecret.replace(/^v1,whsec_/, "");
    const webhook = new Webhook(secret);

    let data;

    try {
      data = webhook.verify(payload, headers);
    } catch {
      return Response.json(
        { error: "Invalid webhook signature." },
        { status: 401 }
      );
    }

    const email = data?.user?.email;
    const token = data?.email_data?.token;

    if (!email || !token) {
      return Response.json(
        { error: "Missing email or verification code." },
        { status: 400 }
      );
    }

    if (
      email.trim().toLowerCase() !==
      testRecipient.trim().toLowerCase()
    ) {
      return Response.json(
        { error: "Only the configured test recipient is allowed." },
        { status: 403 }
      );
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [testRecipient],
        subject: "Your Velfrok verification code",
        text: `Your Velfrok verification code is: ${token}\n\nIf you did not request this code, please ignore this email.`,
      }),
    });

    if (!response.ok) {
      console.error("Resend email delivery failed:", response.status);

      return Response.json(
        { error: "Email delivery failed." },
        { status: 502 }
      );
    }

    return Response.json({}, { status: 200 });
  } catch (error) {
    console.error("Send email hook error:", error);

    return Response.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}
