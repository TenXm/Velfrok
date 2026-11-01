import { supabaseAdmin } from "@/lib/supabase";

// Verifies the user's JWT on every protected API route.
export async function requireUser(req) {
  const authorization = req.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";

  if (!token) {
    return {
      error: Response.json(
        { error: "Unauthorized" },
        { status: 401 }
      ),
    };
  }

  const {
    data: { user },
    error,
  } = await supabaseAdmin().auth.getUser(token);

  if (error || !user) {
    return {
      error: Response.json(
        { error: "Unauthorized" },
        { status: 401 }
      ),
    };
  }

  return { user };
}

export async function requireAdmin(req) {
  const { user, error } = await requireUser(req);

  if (error) {
    return { error };
  }

  const { data: admin, error: adminError } = await supabaseAdmin()
    .from("velfrok_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (adminError) {
    console.error(
      "Admin authorization lookup failed:",
      adminError.message
    );

    return {
      error: Response.json(
        { error: "Unable to verify admin access" },
        { status: 500 }
      ),
    };
  }

  if (!admin) {
    return {
      error: Response.json(
        { error: "Forbidden" },
        { status: 403 }
      ),
    };
  }

  return { user };
}
