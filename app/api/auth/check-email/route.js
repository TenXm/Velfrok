import { supabaseAdmin } from "@/lib/supabase";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

function normalizeEmail(value) {
  if (typeof value !== "string") return null;

  const email = value.trim().toLowerCase();

  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return null;
  }

  return email;
}

export async function POST(req) {
  try {
    await rateLimit(`auth-check-email:${clientIp(req)}`, 20, 60);
    let body;

    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }

    const email = normalizeEmail(body?.email);

    if (!email) {
      return Response.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    const domain = email.split("@").pop();
    const { data, error } = await supabaseAdmin()
      .from("disposable_email_domains")
      .select("domain")
      .eq("domain", domain)
      .maybeSingle();

    if (error) {
      console.error("Disposable email lookup failed:", error);
      return Response.json(
        { error: "Email validation is temporarily unavailable. Please try again." },
        { status: 503 }
      );
    }

    if (data) {
      return Response.json(
        {
          valid: false,
          error: "Temporary or disposable email addresses are not accepted. Please use a permanent email address.",
        },
        { status: 422, headers: { "Cache-Control": "no-store" } }
      );
    }

    return Response.json(
      { valid: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Email validation failed:", error);
    return Response.json(
      { error: "Unable to validate this email right now." },
      { status: 500 }
    );
  }
}
