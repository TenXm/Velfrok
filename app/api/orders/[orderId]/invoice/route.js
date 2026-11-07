import { requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";
import { makeInvoice } from "@/lib/invoice-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req, { params }) {
  try {
    const { user, error: authError } = await requireUser(req);
    if (authError) return authError;
    await rateLimit("customer-invoice:" + user.id, 10, 60);

    const { orderId } = await params;
    if (!UUID.test(String(orderId || ""))) {
      return Response.json({ error: "Invalid order reference." }, { status: 400 });
    }

    const db = supabaseAdmin();
    const { data: order, error: orderError } = await db.from("orders")
      .select("*, order_items(*)")
      .eq("id", orderId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (orderError) {
      console.error("Customer invoice lookup failed:", orderError.message);
      return Response.json({ error: "Could not load this order invoice." }, { status: 500 });
    }
    if (!order) return Response.json({ error: "Order not found." }, { status: 404 });
    if (order.payment_status !== "accepted") {
      return Response.json({ error: "Your invoice will be available after payment is verified." }, { status: 403 });
    }

    const { data: invoiceSettings } = await db.from("invoice_settings").select("*").eq("id", 1).maybeSingle();
    const settings = invoiceSettings || { business_name: "Velfrok", phone: "", email: "", address: "", gst_number: "", terms: "" };
    const bytes = await makeInvoice(order, settings);
    const filePart = String(order.order_number || order.id.slice(0, 8)).replace(/[^a-zA-Z0-9_-]/g, "_");
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="velfrok-invoice-${filePart}.pdf"` ,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Customer invoice generation failed:", error);
    return Response.json({ error: "Invoice download failed. Please try again." }, { status: 500 });
  }
}