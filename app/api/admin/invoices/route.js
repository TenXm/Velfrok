import { requireAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import { makeInvoice } from "@/lib/invoice-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req) {
  try {
    const { user, error } = await requireAdmin(req);
    if (error) return error;
    await rateLimit("admin-invoices:" + user.id, 10, 60);

    let body;
    try { body = await req.json(); } catch { return Response.json({ error: "Invalid request body." }, { status: 400 }); }
    const ids = Array.isArray(body?.orderIds) ? [...new Set(body.orderIds)] : [];
    const format = body?.format;
    if (!ids.length || ids.length > 50 || ids.some(id => typeof id !== "string" || !UUID.test(id))) {
      return Response.json({ error: "Select between 1 and 50 valid orders." }, { status: 400 });
    }
    if (!["zip", "combined"].includes(format)) return Response.json({ error: "Choose ZIP or combined PDF." }, { status: 400 });

    const { data: orders, error: dbError } = await supabaseAdmin()
      .from("orders").select("*, order_items(*)").in("id", ids);
    if (dbError) {
      console.error("Admin invoice order lookup failed:", dbError.message);
      return Response.json({ error: "Could not load selected orders." }, { status: 500 });
    }
    if (!orders || orders.length !== ids.length) return Response.json({ error: "One or more selected orders could not be found." }, { status: 404 });

    const { data: invoiceSettings } = await supabaseAdmin().from("invoice_settings").select("*").eq("id", 1).maybeSingle();
    const settings = invoiceSettings || { business_name: "Velfrok", phone: "", email: "", address: "", gst_number: "", terms: "" };
    const orderById = new Map(orders.map(order => [order.id, order]));
    const ordered = ids.map(id => orderById.get(id)).filter(Boolean);
    const pdfs = [];
    for (const order of ordered) pdfs.push({ order, bytes: await makeInvoice(order, settings) });

    if (format === "combined") {
      const combined = await PDFDocument.create();
      for (const item of pdfs) {
        const source = await PDFDocument.load(item.bytes);
        const pages = await combined.copyPages(source, source.getPageIndices());
        pages.forEach(page => combined.addPage(page));
      }
      const bytes = await combined.save();
      return new Response(bytes, { headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="velfrok-invoices-combined.pdf"',
        "Cache-Control": "no-store",
      }});
    }

    const zip = new JSZip();
    for (const item of pdfs) {
      const name = String(item.order.order_number || item.order.id.slice(0, 8)).replace(/[^a-zA-Z0-9_-]/g, "_");
      zip.file("invoice-" + name + ".pdf", item.bytes);
    }
    const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
    return new Response(bytes, { headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="velfrok-invoices.zip"',
      "Cache-Control": "no-store",
    }});
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Admin invoice generation failed:", error);
    return Response.json({ error: "Invoice generation failed. Please try again." }, { status: 500 });
  }
}