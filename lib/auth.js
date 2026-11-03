import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createClient } from "@supabase/supabase-js";

export async function requireUser(req) {
  const authHeader = req.headers.get("authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      error: "Unauthorized",
      status: 401,
    };
  }

  const token = authHeader.slice(7);

  const {
    data: { user },
    error,
  } = await supabaseAdmin().auth.getUser(token);

  if (error || !user) {
    return {
      error: "Invalid or expired session",
      status: 401,
    };
  }

  return {
    user,
    token,
  };
}

export async function requireAdmin(req) {
  const authResult = await requireUser(req);

  if (authResult.error) {
    return authResult;
  }

  const { user, token } = authResult;

  const { data: admin, error: adminError } = await supabaseAdmin()
    .from("velfrok_admins")
    .select("user_id, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (adminError || !admin) {
    return {
      error: "Admin access required",
      status: 403,
    };
  }

  const tokenParts = token.split(".");

  if (tokenParts.length !== 3) {
    return {
      error: "Invalid access token",
      status: 401,
    };
  }

  let payload;

  try {
    payload = JSON.parse(
      Buffer.from(tokenParts[1], "base64url").toString("utf8")
    );
  } catch {
    return {
      error: "Invalid access token",
      status: 401,
    };
  }

  if (payload.aal !== "aal2") {
    return {
      error: "Administrator MFA verification required.",
      status: 403,
    };
  }

  return {
    user,
    admin,
  };
}

export function supabaseForUser(req) {
  const authHeader = req.headers.get("authorization");

  const token =
    authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: {
        headers: token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : {},
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
