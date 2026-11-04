import { supabaseAdmin } from "./supabase";
import { createClient } from "@supabase/supabase-js";

function errorResponse(message, status) {
  return Response.json({ error: message }, { status });
}

export async function requireUser(req) {
  const authHeader = req.headers.get("authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { user: null, token: null, error: errorResponse("Unauthorized", 401) };
  }

  const token = authHeader.slice(7);
  const {
    data: { user },
    error,
  } = await supabaseAdmin().auth.getUser(token);

  if (error || !user) {
    return { user: null, token: null, error: errorResponse("Invalid or expired session", 401) };
  }

  return { user, token, error: null };
}

function readTokenClaims(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export async function requireAdmin(req) {
  const authResult = await requireUser(req);
  if (authResult.error) {
    return { user: null, admin: null, error: authResult.error };
  }

  const { user, token } = authResult;
  const { data: admin, error: adminError } = await supabaseAdmin()
    .from("velfrok_admins")
    .select("user_id, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (adminError || !admin) {
    return { user: null, admin: null, error: errorResponse("Admin access required", 403) };
  }

  const claims = readTokenClaims(token);
  if (claims?.admin_email_otp_verified !== true) {
    return {
      user: null,
      admin: null,
      error: errorResponse("Administrator email verification required.", 403),
    };
  }

  return { user, admin, error: null };
}

export function supabaseForUser(req) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      auth: { autoRefreshToken: false, persistSession: false },
    }
  );
}
