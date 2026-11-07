import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const { user, error } = await requireAdmin(req);
    if (error) return error;
    await rateLimit(`admin-audit-logs-get:${user.id}`, 30, 60);

    const { searchParams } = new URL(req.url);
    const requestedLimit = Number(searchParams.get("limit") || 100);
    const limit = Number.isInteger(requestedLimit)
      ? Math.max(1, Math.min(requestedLimit, 100))
      : 100;

    const { data, error: queryError } = await supabaseAdmin()
      .from("admin_audit_logs")
      .select("id,event,actor_user_id,actor_email,resource_id,ip_address,details,created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (queryError) {
      console.error("Admin audit log lookup failed:", queryError.message);
      return Response.json({ error: "Could not load audit history. Apply migration 018 first." }, { status: 503 });
    }

    return Response.json({ logs: data || [] }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Admin audit logs GET failed:", error);
    return Response.json({ error: "Server error." }, { status: 500 });
  }
}
