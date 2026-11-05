import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const defaults = { business_name: "Velfrok", phone: "", email: "", address: "", gst_number: "", gst_rate: "0", tax_label: "", tax_rate: "0", terms: "" };
const fail = (message, status = 400) => Response.json({ error: message }, { status });
const clean = (value, max = 500) => typeof value === "string" ? value.trim().slice(0, max) : "";

async function guard(req, action) {
  const auth = await requireAdmin(req);
  if (auth.error) return { error: auth.error };
  await rateLimit(`admin-invoice-settings-${action}:${auth.user.id}`, 30, 60);
  return { user: auth.user };
}
function parse(body) {
  const value = {
    business_name: clean(body?.business_name, 160) || "Velfrok",
    phone: clean(body?.phone, 40), email: clean(body?.email, 160),
    address: clean(body?.address, 500), gst_number: clean(body?.gst_number, 40),
    gst_rate: String(Number(body?.gst_rate ?? 0)), tax_label: clean(body?.tax_label, 80),
    tax_rate: String(Number(body?.tax_rate ?? 0)), terms: clean(body?.terms, 3000),
  };
  for (const field of ["gst_rate", "tax_rate"]) {
    const n = Number(value[field]);
    if (!Number.isFinite(n) || n < 0 || n > 100) return { error: "Tax rate must be between 0 and 100." };
  }
  if (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) return { error: "Enter a valid email address." };
  return { value };
}
export async function GET(req) {
  try {
    const auth = await guard(req, "get");
    if (auth.error) return auth.error;
    const { data, error } = await supabaseAdmin().from("invoice_settings").select("*").eq("id", 1).maybeSingle();
    if (error) { console.error("Invoice settings load failed:", error.message); return fail("Could not load invoice settings. Apply the invoice settings database migration first.", 500); }
    return Response.json({ settings: { ...defaults, ...(data || {}) } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { if (error instanceof Response) return error; console.error("Invoice settings GET failed:", error); return fail("Server error.", 500); }
}
export async function PUT(req) {
  try {
    const auth = await guard(req, "put");
    if (auth.error) return auth.error;
    let body; try { body = await req.json(); } catch { return fail("Invalid request body."); }
    const parsed = parse(body || {});
    if (parsed.error) return fail(parsed.error);
    const { data, error } = await supabaseAdmin().from("invoice_settings").upsert({ id: 1, ...parsed.value, updated_at: new Date().toISOString() }, { onConflict: "id" }).select("*").single();
    if (error) { console.error("Invoice settings save failed:", error.message); return fail("Could not save invoice settings. Apply the invoice settings database migration first.", 500); }
    return Response.json({ settings: { ...defaults, ...data } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { if (error instanceof Response) return error; console.error("Invoice settings PUT failed:", error); return fail("Server error.", 500); }
}