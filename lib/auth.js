
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

// Verify identity, administrator membership, and MFA AAL2.
export async function requireAdmin(req) {
  const result = await requireUser(req);

  if (result.error) return result;

  const { data: admin, error: adminError } = await supabaseAdmin()
    .from("velfrok_admins")
    .select("user_id")
    .eq("user_id", result.user.id)
    .maybeSingle();

  if (adminError) {
    return {
      error: Response.json(
        { error: "Could not verify administrator access." },
        { status: 500 }
      ),
    };
  }

  if (!admin) {
    return {
      error: Response.json(
        { error: "Forbidden." },
        { status: 403 }
      ),
    };
  }

  // Ask Supabase Auth to verify the assurance level for this
  // actual user's session. Do not trust a client-supplied MFA flag.
  try {
    const userDb = supabaseForUser(req);

    const { data: assurance, error: assuranceError } =
      await userDb.auth.mfa.getAuthenticatorAssuranceLevel();

    if (
      assuranceError ||
      assurance?.currentLevel !== "aal2"
    ) {
      return {
        error: Response.json(
          { error: "Administrator MFA verification required." },
          { status: 403 }
        ),
      };
    }
  } catch (error) {
    console.error("Admin MFA verification failed:", error);

    return {
      error: Response.json(
        { error: "Could not verify administrator MFA." },
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
