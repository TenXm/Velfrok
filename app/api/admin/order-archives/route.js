import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { auditLog } from "@/lib/audit";
import { clean } from "@/lib/sanitize";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const { user, error } = await requireAdmin(req);
    if (error) return error;
    await rateLimit(`admin-order-archives-get:${user.id}`, 30, 60);
    const db = supabaseAdmin();
    const [{ data: archives, error: archiveError }, { data: pending, error: pendingError }] = await Promise.all([
      db.from("order_archives").select("*").is("deleted_at", null).order("period_start", { ascending: false }),
      db.from("orders").select("id,order_number,customer_name,delivered_at,total_amount,order_items(*)")
        .eq("fulfillment_status", "delivered").is("archived_at", null).order("delivered_at", { ascending: true }).limit(2000),
    ]);
    if (archiveError || pendingError) {
      console.error("Order archive lookup failed:", archiveError?.message || pendingError?.message);
      return Response.json({ error: "Could not load order archives. Apply migration 017 first." }, { status: 500 });
    }
    const withUrls = await Promise.all((archives || []).map(async archive => {
      const { data } = await db.storage.from("order-archives").createSignedUrl(archive.storage_path, 3600);
      return { ...archive, download_url: data?.signedUrl || null };
    }));
    return Response.json({ archives: withUrls, pendingOrders: pending || [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Order archives GET failed:", error);
    return Response.json({ error: "Server error." }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const { user, error } = await requireAdmin(req);
    if (error) return error;
    await rateLimit(`admin-order-archives-delete:${user.id}`, 10, 60);
    let body;
    try { body = await req.json(); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }
    const id = clean(body?.id, 36);
    if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Invalid archive ID." }, { status: 400 });
    const db = supabaseAdmin();
    const { data: archive, error: lookupError } = await db.from("order_archives").select("*").eq("id", id).maybeSingle();
    if (lookupError) return Response.json({ error: "Could not find archive." }, { status: 500 });
    if (!archive) return Response.json({ error: "Archive not found." }, { status: 404 });
    const { error: storageError } = await db.storage.from("order-archives").remove([archive.storage_path]);
    if (storageError) return Response.json({ error: "Could not delete the Excel file." }, { status: 500 });
    const { error: deleteError } = await db.from("order_archives").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (deleteError) return Response.json({ error: "File deleted but archive metadata could not be updated. Contact support." }, { status: 500 });
    try { await auditLog(user.email || user.id, "order.archive.delete", { id, fileName: archive.file_name }, clientIp(req)); } catch (e) { console.error("Audit logging failed:", e); }
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Order archive DELETE failed:", error);
    return Response.json({ error: "Server error." }, { status: 500 });
  }
}
