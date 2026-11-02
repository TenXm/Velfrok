import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "./supabase";

function getBearerToken(req) {
  const header = req.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] || null;
}

// Validate the session token with Supabase.
export async function requireUser(req) {
  const token = getBearerToken(req);

  if (!token) {
    return {
      error: Response.json(
        { error: "Unauthorized" },
        { status: 401 }
      ),
    };
  }

  const { data, error } = await supabaseAdmin().auth.getUser(token);

  if (error || !data?.user) {
    return {
      error: Response.json(
        { error: "Unauthorized" },
        { status: 401 }
      ),
    };
  }

  return { user: data.user };
}

// Verify administrator membership against the real database table.
export async function requireAdmin(req) {
  const result = await requireUser(req);

  if (result.error) return result;

  const { data, error } = await supabaseAdmin()
    .from("velfrok_admins")
    .select("user_id")
    .eq("user_id", result.user.id)
    .maybeSingle();

  if (error) {
    return {
      error: Response.json(
        { error: "Could not verify administrator access" },
        { status: 500 }
      ),
    };
  }

  if (!data) {
    return {
      error: Response.json(
        { error: "Forbidden" },
        { status: 403 }
      ),
    };
  }

  return { user: result.user };
}

// Create a Supabase client carrying the actual user's JWT.
// Required for database functions that check auth.uid().
export function supabaseForUser(req) {
  const token = getBearerToken(req);

  if (!token) {
    throw new Error("Missing authenticated session");
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    }
  );
}
