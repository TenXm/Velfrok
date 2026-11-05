import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { requireAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import JSZip from "jszip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = { width: 595.28, height: 841.89 };
const green = rgb(0.12, 0.27, 0.20);
const pale = rgb(0.95, 0.94, 0.89);
const ink = rgb(0.13, 0.18, 0.15);
const muted = rgb(0.40, 0.44, 0.41);
const line = rgb(0.86, 0.87, 0.83);

function text(value) {
  return String(value ?? "").replace(/[\r\n\t]+/g, " ").trim();
}
function safeText(value, font) {
  const supported = new Set(font.getCharacterSet());
  return Array.from(text(value)).map(char =>
    supported.has(char.codePointAt(0)) ? char : "?"
  ).join("");
}
function money(value) {
  return "Rs. " + Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function date(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}
function wrap(value, font, size, maxWidth) {
  const words = text(value).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? current + " " + word : word;
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(current);
      current = word;
    } else current = candidate;
  }
  if (current) lines.push(current);
  return lines.length ? lines : ["—"];
}
async function loadInvoiceFont(doc) {
  try {
    const dir = join(process.cwd(), "node_modules", "@fontsource", "noto-sans-bengali", "files");
    const file = readdirSync(dir).find(name => name.includes("bengali-400-normal") && name.endsWith(".woff2"));
    if (file) {
      doc.registerFontkit(fontkit);
      return await doc.embedFont(readFileSync(join(dir, file)), { subset: true });
    }
  } catch (error) {
    console.warn("Bengali invoice font unavailable; using standard PDF font.");
  }
  return doc.embedFont(StandardFonts.Helvetica);
}
function drawWrapped(page, value, x, y, width, font, size, color, lineHeight = size + 3, maxLines = 3) {
  const lines = wrap(value, font, size, width).slice(0, maxLines);
  lines.forEach((lineText, index) => page.drawText(lineText, { x, y: y - index * lineHeight, size, font, color }));
  return y - lines.length * lineHeight;
}
async function makeInvoice(order, settings) {
  const doc = await PDFDocument.create();
  const font = await loadInvoiceFont(doc);
  const bold = font;
  const left = 42, right = PAGE.width - 42;
  const orderNo = text(order.order_number || String(order.id).slice(0, 8));
  const items = Array.isArray(order.order_items) ? order.order_items : [];
  const chunks = [];
  for (let index = 0; index < Math.max(items.length, 1); index += 12) chunks.push(items.slice(index, index + 12));

  const subtotal = Number(order.subtotal ?? order.total_amount ?? order.total ?? 0);
  const discount = Number(order.discount_amount ?? order.discount ?? 0);
  const shipping = Number(order.shipping_amount ?? order.shipping ?? 0);
  const total = Number(order.total_amount ?? order.total ?? Math.max(0, subtotal - discount + shipping));
  // Allocate the order-level coupon discount proportionally across all invoice lines
  // before extracting GST from tax-inclusive prices. This keeps the tax base aligned
  // with the discounted consideration while preserving each line's GST rate.
  const gstByRate = new Map();
  const invoiceLineSubtotal = items.reduce((sum, item) => {
    const amount = Number(item.line_total ?? (Number(item.unit_price || 0) * Number(item.quantity || 0)));
    return sum + (Number.isFinite(amount) && amount > 0 ? amount : 0);
  }, 0);
  const discountRatio = invoiceLineSubtotal > 0
    ? Math.min(1, Math.max(0, discount / invoiceLineSubtotal))
    : 0;
  for (const item of items) {
    const rate = Number(item.gst_rate || 0);
    const originalLineAmount = Number(item.line_total ?? (Number(item.unit_price || 0) * Number(item.quantity || 0)));
    if (!Number.isFinite(rate) || rate < 0 || !Number.isFinite(originalLineAmount) || originalLineAmount <= 0) continue;
    const lineDiscount = originalLineAmount * discountRatio;
    const discountedLineAmount = Math.max(0, originalLineAmount - lineDiscount);
    if (!rate || discountedLineAmount <= 0) continue;
    const tax = discountedLineAmount * rate / (100 + rate);
    const row = gstByRate.get(rate) || { taxable: 0, tax: 0 };
    row.taxable += discountedLineAmount - tax;
    row.tax += tax;
    gstByRate.set(rate, row);
  }
  const includedTaxTotal = [...gstByRate.values()].reduce((sum, row) => sum + row.tax, 0);
  const taxableTotal = [...gstByRate.values()].reduce((sum, row) => sum + row.taxable, 0);

  for (let pageIndex = 0; pageIndex < chunks.length; pageIndex++) {
    const page = doc.addPage([PAGE.width, PAGE.height]);
    const pageItems = chunks[pageIndex];
    const isFirst = pageIndex === 0;
    const isLast = pageIndex === chunks.length - 1;

    page.drawRectangle({ x: 0, y: PAGE.height - 132, width: PAGE.width, height: 132, color: pale });
    page.drawText(safeText(settings.business_name || "Velfrok", font).slice(0, 32), { x: left, y: PAGE.height - 58, size: 20, font: bold, color: green });
    const contactLines = [settings.phone, settings.email, settings.address, settings.gst_number ? "GSTIN: " + settings.gst_number : ""].filter(Boolean);
    contactLines.slice(0, 4).forEach((value, index) => page.drawText(safeText(value, font).slice(0, 95), { x: left, y: PAGE.height - 74 - index * 11, size: 7, font, color: muted }));
    page.drawText("INVOICE", { x: right - 105, y: PAGE.height - 52, size: 17, font: bold, color: green });
    page.drawText("Order " + orderNo, { x: right - 170, y: PAGE.height - 75, size: 9, font, color: ink });
    page.drawText("Invoice date: " + date(order.created_at), { x: left, y: PAGE.height - 91, size: 9, font, color: muted });
    page.drawText(isFirst ? "Generated: " + date(new Date().toISOString()) : "Continued · Page " + (pageIndex + 1), { x: left, y: PAGE.height - 106, size: 8, font, color: muted });

    if (isFirst) {
      let y = PAGE.height - 160;
      page.drawText("BILL TO", { x: left, y, size: 9, font: bold, color: green });
      page.drawText("ORDER DETAILS", { x: 325, y, size: 9, font: bold, color: green });
      y -= 20;
      let customerY = y;
      customerY = drawWrapped(page, safeText(order.customer_name || "Customer", font), left, customerY, 230, bold, 11, ink, 14, 2);
      customerY = drawWrapped(page, safeText(order.email || "", font), left, customerY - 2, 230, font, 8, muted, 11, 2);
      customerY = drawWrapped(page, safeText(order.mobile || "", font), left, customerY - 2, 230, font, 8, muted, 11, 1);
      const address = [order.address || order.street_address, order.landmark, order.city, order.state, order.pincode || order.pin_code].filter(Boolean).join(", ");
      drawWrapped(page, safeText(address, font), left, customerY - 2, 245, font, 8, muted, 11, 4);
      page.drawText("Payment: " + safeText(order.payment_method || "UPI", font).toUpperCase(), { x: 325, y, size: 9, font, color: ink });
      page.drawText("Payment status: " + safeText(order.payment_status || "—", font), { x: 325, y: y - 15, size: 9, font, color: ink });
      page.drawText("Fulfilment: " + safeText(order.fulfillment_status || "—", font), { x: 325, y: y - 30, size: 9, font, color: ink });
    } else {
      page.drawText("ITEMS CONTINUED", { x: left, y: PAGE.height - 165, size: 10, font: bold, color: green });
    }

    const tableTop = PAGE.height - 300;
    page.drawRectangle({ x: left, y: tableTop - 24, width: right - left, height: 24, color: green });
    page.drawText("ITEM", { x: left + 8, y: tableTop - 16, size: 8, font: bold, color: rgb(1, 1, 1) });
    page.drawText("QTY", { x: 365, y: tableTop - 16, size: 8, font: bold, color: rgb(1, 1, 1) });
    page.drawText("PRICE", { x: 410, y: tableTop - 16, size: 8, font: bold, color: rgb(1, 1, 1) });
    page.drawText("TOTAL", { x: 495, y: tableTop - 16, size: 8, font: bold, color: rgb(1, 1, 1) });

    let rowY = tableTop - 43;
    for (const item of pageItems) {
      const name = safeText(item.product_name || "Product", font);
      page.drawText(name.slice(0, 48), { x: left + 8, y: rowY, size: 8, font, color: ink });
      const detail = [item.sku, item.color].filter(Boolean).join(" · ");
      if (detail) page.drawText(safeText(detail, font).slice(0, 54), { x: left + 8, y: rowY - 11, size: 7, font, color: muted });
      page.drawText(String(item.quantity || 0), { x: 370, y: rowY, size: 8, font, color: ink });
      page.drawText(money(item.unit_price), { x: 410, y: rowY, size: 8, font, color: ink });
      page.drawText(money(item.line_total), { x: 490, y: rowY, size: 8, font, color: ink });
      page.drawLine({ start: { x: left, y: rowY - 18 }, end: { x: right, y: rowY - 18 }, thickness: 0.5, color: line });
      rowY -= 27;
    }
    if (!pageItems.length) {
      page.drawText("No item details available.", { x: left + 8, y: rowY, size: 9, font, color: muted });
      rowY -= 27;
    }

    if (isLast) {
      const totalsY = rowY - 25;
      const labelX = 365, valueX = 475;
      const totalRows = [
        ["Subtotal (tax-inclusive)", money(subtotal)],
        ...(gstByRate.size ? [["Taxable value", money(taxableTotal)], ...[...gstByRate.entries()].sort((a,b)=>a[0]-b[0]).map(([rate, row]) => [`GST included (${rate}%)`, money(row.tax)])] : []),
        ["Discount", "- " + money(discount)],
        ...(shipping ? [["Shipping", money(shipping)]] : []),
      ];
      totalRows.forEach((entry, index) => {
        const yy = totalsY - index * 17;
        page.drawText(entry[0], { x: labelX, y: yy, size: 9, font, color: muted });
        page.drawText(entry[1], { x: valueX, y: yy, size: 9, font, color: ink });
      });
      const grandY = totalsY - totalRows.length * 17 - 5;
      page.drawRectangle({ x: 350, y: grandY - 10, width: right - 350, height: 29, color: pale });
      page.drawText("TOTAL", { x: labelX, y: grandY, size: 10, font: bold, color: green });
      page.drawText(money(total), { x: valueX, y: grandY, size: 10, font: bold, color: green });
    }

    page.drawLine({ start: { x: left, y: 72 }, end: { x: right, y: 72 }, thickness: 0.8, color: line });
    page.drawText("Thank you for shopping with Velfrok.", { x: left, y: 54, size: 9, font, color: green });
    page.drawText("This is a computer-generated invoice.", { x: left, y: 39, size: 7, font, color: muted });
  }
  return doc.save();
}

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
