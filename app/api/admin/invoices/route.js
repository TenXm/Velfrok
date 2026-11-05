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
  const supported = new Set(font.getCharacterSet());
  const bold = font;
  const black = rgb(0.08, 0.08, 0.08);
  const dark = rgb(0.18, 0.18, 0.18);
  const grey = rgb(0.42, 0.42, 0.42);
  const light = rgb(0.88, 0.88, 0.88);
  const left = 42, right = PAGE.width - 42;
  const contentWidth = right - left;
  const orderNo = text(order.order_number || String(order.id).slice(0, 8));
  const items = Array.isArray(order.order_items) ? order.order_items : [];
  const chunks = [];
  for (let index = 0; index < Math.max(items.length, 1); index += 7) chunks.push(items.slice(index, index + 7));

  const safe = value => safeText(value, font);
  const moneyText = value => {
    const amount = Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (supported.has(0x20b9) ? "₹ " : "INR ") + amount;
  };
  const subtotal = Number(order.subtotal ?? order.total_amount ?? order.total ?? 0);
  const discount = Number(order.discount_amount ?? order.discount ?? 0);
  const shipping = Number(order.shipping_amount ?? order.shipping ?? 0);
  const total = Number(order.total_amount ?? order.total ?? Math.max(0, subtotal - discount + shipping));

  const gstByRate = new Map();
  const invoiceLineSubtotal = items.reduce((sum, item) => {
    const amount = Number(item.line_total ?? (Number(item.unit_price || 0) * Number(item.quantity || 0)));
    return sum + (Number.isFinite(amount) && amount > 0 ? amount : 0);
  }, 0);
  const discountRatio = invoiceLineSubtotal > 0 ? Math.min(1, Math.max(0, discount / invoiceLineSubtotal)) : 0;
  for (const item of items) {
    const rate = Number(item.gst_rate || 0);
    const originalLineAmount = Number(item.line_total ?? (Number(item.unit_price || 0) * Number(item.quantity || 0)));
    if (!Number.isFinite(rate) || rate < 0 || !Number.isFinite(originalLineAmount) || originalLineAmount <= 0) continue;
    const discountedLineAmount = Math.max(0, originalLineAmount * (1 - discountRatio));
    if (!rate || discountedLineAmount <= 0) continue;
    const tax = discountedLineAmount * rate / (100 + rate);
    const row = gstByRate.get(rate) || { taxable: 0, tax: 0 };
    row.taxable += discountedLineAmount - tax;
    row.tax += tax;
    gstByRate.set(rate, row);
  }
  const includedTaxTotal = [...gstByRate.values()].reduce((sum, row) => sum + row.tax, 0);
  const taxableTotal = [...gstByRate.values()].reduce((sum, row) => sum + row.taxable, 0);

  const terms = [
    "Return, Replacement & Exchange: Requests must be raised within 7 days of delivery. Requests made after this 7-day period will not be accepted.",
    "Damaged or Defective Products: Please record a clear video of any product received damaged, broken, or defective, and send it via WhatsApp to the number provided in the Billing Address section above.",
    "Additional Terms: For further terms and conditions, please visit our website."
  ];

  for (let pageIndex = 0; pageIndex < chunks.length; pageIndex++) {
    const page = doc.addPage([PAGE.width, PAGE.height]);
    const pageItems = chunks[pageIndex];
    const isFirst = pageIndex === 0;
    const isLast = pageIndex === chunks.length - 1;

    // Minimal black-and-white invoice header.
    page.drawText(safe(settings.business_name || "Velfrok").slice(0, 42), {
      x: left, y: PAGE.height - 55, size: 21, font: bold, color: black
    });
    const contactLines = [settings.phone, settings.email, settings.address, settings.gst_number ? "GSTIN: " + settings.gst_number : ""].filter(Boolean);
    contactLines.slice(0, 3).forEach((value, index) => {
      page.drawText(safe(value).slice(0, 110), { x: left, y: PAGE.height - 72 - index * 11, size: 7.5, font, color: grey });
    });
    page.drawText("INVOICE", { x: right - 112, y: PAGE.height - 55, size: 18, font: bold, color: black });
    page.drawText("Order " + safe(orderNo), { x: right - 150, y: PAGE.height - 76, size: 8.5, font, color: dark });
    page.drawText("Invoice date: " + safe(date(order.created_at)), { x: right - 190, y: PAGE.height - 91, size: 8, font, color: grey });
    if (contactLines[3]) page.drawText(safe(contactLines[3]), { x: left, y: PAGE.height - 105, size: 7.5, font, color: grey });
    page.drawLine({ start: { x: left, y: PAGE.height - 120 }, end: { x: right, y: PAGE.height - 120 }, thickness: 1, color: black });

    let tableTop;
    if (isFirst) {
      const blockTop = PAGE.height - 148;
      page.drawText("BILL TO", { x: left, y: blockTop, size: 8.5, font: bold, color: black });
      page.drawText("ORDER DETAILS", { x: 330, y: blockTop, size: 8.5, font: bold, color: black });
      let customerY = blockTop - 19;
      customerY = drawWrapped(page, safe(order.customer_name || "Customer"), left, customerY, 245, bold, 10, dark, 13, 2);
      customerY = drawWrapped(page, safe(order.email || ""), left, customerY - 1, 245, font, 8, grey, 11, 2);
      customerY = drawWrapped(page, safe(order.mobile || ""), left, customerY - 1, 245, font, 8, grey, 11, 1);
      const address = [order.address || order.street_address, order.landmark, order.city, order.state, order.pincode || order.pin_code].filter(Boolean).join(", ");
      drawWrapped(page, safe(address), left, customerY - 1, 245, font, 8, grey, 11, 4);

      const details = [
        "Payment: " + safe(order.payment_method || "UPI").toUpperCase(),
        "Payment status: " + safe(order.payment_status || "—"),
        "Fulfilment: " + safe(order.fulfillment_status || "—")
      ];
      details.forEach((value, index) => page.drawText(value, { x: 330, y: blockTop - 20 - index * 15, size: 8, font, color: dark }));
      tableTop = PAGE.height - 278;
    } else {
      page.drawText("ITEMS CONTINUED", { x: left, y: PAGE.height - 153, size: 9, font: bold, color: black });
      tableTop = PAGE.height - 180;
    }

    // Fixed column boundaries keep quantities and amounts aligned.
    const itemX = left + 8;
    const qtyRight = 385;
    const priceRight = 465;
    const totalRight = right - 8;
    page.drawRectangle({ x: left, y: tableTop - 23, width: contentWidth, height: 23, color: black });
    page.drawText("DESCRIPTION", { x: itemX, y: tableTop - 15.5, size: 7.5, font: bold, color: rgb(1, 1, 1) });
    page.drawText("QTY", { x: qtyRight - 25, y: tableTop - 15.5, size: 7.5, font: bold, color: rgb(1, 1, 1) });
    page.drawText("UNIT PRICE", { x: priceRight - 58, y: tableTop - 15.5, size: 7.5, font: bold, color: rgb(1, 1, 1) });
    page.drawText("AMOUNT", { x: totalRight - 48, y: tableTop - 15.5, size: 7.5, font: bold, color: rgb(1, 1, 1) });

    let rowY = tableTop - 42;
    for (const item of pageItems) {
      const nameLines = wrap(safe(item.product_name || "Product"), font, 8, 270).slice(0, 2);
      nameLines.forEach((lineText, index) => page.drawText(lineText, { x: itemX, y: rowY - index * 10, size: 8, font, color: dark }));
      const detail = [item.sku, item.color].filter(Boolean).join(" | ");
      if (detail) page.drawText(wrap(safe(detail), font, 6.8, 270)[0].slice(0, 70), { x: itemX, y: rowY - nameLines.length * 10, size: 6.8, font, color: grey });
      const qty = String(item.quantity || 0);
      const price = moneyText(item.unit_price);
      const amount = moneyText(item.line_total ?? (Number(item.unit_price || 0) * Number(item.quantity || 0)));
      page.drawText(qty, { x: qtyRight - font.widthOfTextAtSize(qty, 8), y: rowY, size: 8, font, color: dark });
      page.drawText(price, { x: priceRight - font.widthOfTextAtSize(price, 7.5), y: rowY, size: 7.5, font, color: dark });
      page.drawText(amount, { x: totalRight - font.widthOfTextAtSize(amount, 7.5), y: rowY, size: 7.5, font, color: dark });
      page.drawLine({ start: { x: left, y: rowY - 23 }, end: { x: right, y: rowY - 23 }, thickness: 0.45, color: light });
      rowY -= 36;
    }
    if (!pageItems.length) {
      page.drawText("No item details available.", { x: itemX, y: rowY, size: 8, font, color: grey });
      rowY -= 36;
    }

    if (isLast) {
      let y = rowY - 5;
      const totalRows = [
        ["Subtotal (tax-inclusive)", moneyText(subtotal)],
        ...(gstByRate.size ? [["Taxable value", moneyText(taxableTotal)], ...[...gstByRate.entries()].sort((a,b)=>a[0]-b[0]).map(([rate, row]) => ["GST included (" + rate + "%)", moneyText(row.tax)])] : []),
        ["Discount", "- " + moneyText(discount)],
        ...(shipping ? [["Shipping", moneyText(shipping)]] : [])
      ];
      const labelRight = 455;
      const valueRight = right - 8;
      totalRows.forEach(([label, value]) => {
        page.drawText(label, { x: labelRight - font.widthOfTextAtSize(label, 8), y, size: 8, font, color: grey });
        page.drawText(value, { x: valueRight - font.widthOfTextAtSize(value, 8), y, size: 8, font, color: dark });
        y -= 13;
      });
      y -= 2;
      page.drawLine({ start: { x: 340, y: y + 9 }, end: { x: right, y: y + 9 }, thickness: 0.8, color: black });
      const grandLabel = "TOTAL";
      const grandValue = moneyText(total);
      page.drawText(grandLabel, { x: labelRight - font.widthOfTextAtSize(grandLabel, 10), y: y - 4, size: 10, font: bold, color: black });
      page.drawText(grandValue, { x: valueRight - font.widthOfTextAtSize(grandValue, 10), y: y - 4, size: 10, font: bold, color: black });
      y -= 30;

      // Terms are laid out as wrapped paragraphs with reserved vertical space.
      if (y > 105) {
        page.drawLine({ start: { x: left, y: y }, end: { x: right, y }, thickness: 0.6, color: light });
        y -= 17;
        page.drawText("TERMS & CONDITIONS", { x: left, y, size: 8.5, font: bold, color: black });
        y -= 14;
        for (let index = 0; index < terms.length; index++) {
          const lines = wrap(safe((index + 1) + ". " + terms[index]), font, 7, contentWidth);
          for (const lineText of lines) {
            if (y < 91) break;
            page.drawText(lineText, { x: left, y, size: 7, font, color: dark });
            y -= 9;
          }
          y -= 3;
        }
      }
    }

    page.drawLine({ start: { x: left, y: 55 }, end: { x: right, y: 55 }, thickness: 0.7, color: black });
    page.drawText("Thank you for shopping with " + safe(settings.business_name || "Velfrok") + ".", { x: left, y: 39, size: 8, font, color: dark });
    page.drawText("This is a computer-generated invoice.", { x: right - 155, y: 39, size: 7, font, color: grey });
    page.drawText("Page " + (pageIndex + 1) + " of " + chunks.length, { x: right - 55, y: 25, size: 6.5, font, color: grey });
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
