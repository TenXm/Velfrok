import JSZip from "jszip";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const IST_OFFSET_MINUTES = 330;
const xmlEscape = value => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const columnName = index => {
  let name = "";
  while (index > 0) { const remainder = (index - 1) % 26; name = String.fromCharCode(65 + remainder) + name; index = Math.floor((index - 1) / 26); }
  return name;
};
function makeWorkbook(rows) {
  const headers = ["Order Number","Order ID","Order Date","Delivered Date","Customer Name","Mobile","Email","Billing Address","City","PIN Code","Product Name","Product ID","SKU","Quantity","Selected Options","Unit Price","Line Total","GST Rate","GST Amount","Discount","Delivery Charge","Order Total","Payment Method","Payment Status","Acceptance Status","Courier Company","AWB Number","Tracking URL","Invoice Reference"];
  const records = [headers, ...rows.map(row => [
    row.order_number, row.id, row.created_at, row.delivered_at, row.customer_name, row.mobile, row.email,
    row.address || row.street_address, row.city, row.pin_code || row.pincode,
    row.product_name, row.product_id, row.sku, row.quantity, row.options ? JSON.stringify(row.options) : "",
    row.unit_price, row.line_total, row.gst_rate, row.gst_amount, row.discount_amount, row.delivery_charge, row.total_amount,
    row.payment_method, row.payment_status, row.order_acceptance_status, row.delivery_partner, row.awb_number,
    row.tracking_url, row.invoice_number || row.invoice_id
  ])];
  const sheetRows = records.map((record, rowIndex) => {
    const cells = record.map((value, colIndex) => {
      const ref = `${columnName(colIndex + 1)}${rowIndex + 1}`;
      if (rowIndex > 0 && typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}"><v>${value}</v></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`);
  zip.folder("_rels").file(".rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.folder("xl").file("workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Delivered Orders" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.folder("xl").folder("_rels").file("workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`);
  zip.folder("xl").folder("worksheets").file("sheet1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

function istMonthWindow(now) {
  const ist = new Date(now.getTime() + IST_OFFSET_MINUTES * 60_000);
  const year = ist.getUTCFullYear();
  const month = ist.getUTCMonth();
  const start = new Date(Date.UTC(year, month - 1, 1) - IST_OFFSET_MINUTES * 60_000);
  const end = new Date(Date.UTC(year, month, 1) - IST_OFFSET_MINUTES * 60_000);
  const periodYear = month === 0 ? year - 1 : year;
  const periodMonth = month === 0 ? 12 : month;
  const periodStart = `${periodYear}-${String(periodMonth).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const periodEnd = `${periodYear}-${String(periodMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start: start.toISOString(), end: end.toISOString(), periodStart, periodEnd, fileMonth: `${periodYear}-${String(periodMonth).padStart(2, "0")}` };
}

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized." }, { status: 401 });
  const window = istMonthWindow(new Date());

  const db = supabaseAdmin();
  const { data: existingArchive, error: existingError } = await db.from("order_archives").select("id,file_name").eq("period_start", window.periodStart).maybeSingle();
  if (existingError) return Response.json({ error: "Archive table is unavailable. Apply migration 017." }, { status: 500 });
  if (existingArchive) {
    const { error: retryMarkError } = await db.from("orders").update({ archived_at: new Date().toISOString() })
      .eq("fulfillment_status", "delivered").gte("delivered_at", window.start).lt("delivered_at", window.end)
      .is("archived_at", null);
    if (retryMarkError) return Response.json({ error: "Archive file exists, but source orders could not be marked archived." }, { status: 500 });
    return Response.json({ ok: true, alreadyArchived: true, archive: existingArchive });
  }
  const { data: orders, error: orderError } = await db.from("orders").select("*,order_items(*)")
    .eq("fulfillment_status", "delivered").gte("delivered_at", window.start).lt("delivered_at", window.end)
    .is("archived_at", null).order("delivered_at", { ascending: true }).limit(10000);
  if (orderError) return Response.json({ error: "Could not retrieve delivered orders." }, { status: 500 });
  const rows = [];
  for (const order of orders || []) {
    const items = Array.isArray(order.order_items) && order.order_items.length ? order.order_items : [null];
    for (const item of items) rows.push({
      ...order, product_name: item?.product_name, product_id: item?.product_id, sku: item?.sku,
      quantity: item?.quantity, options: item?.options, unit_price: item?.unit_price, gst_rate: item?.gst_rate,
      line_total: item?.line_total,
    });
  }
  const workbook = await makeWorkbook(rows);
  const fileName = `Velfrok_Orders_${window.fileMonth}.xlsx`;
  const storagePath = `monthly/${window.fileMonth}/${fileName}`;
  const { error: uploadError } = await db.storage.from("order-archives").upload(storagePath, workbook, {
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", upsert: false,
  });
  if (uploadError) return Response.json({ error: "Excel file could not be saved. Original orders were left unchanged.", details: uploadError.message }, { status: 500 });
  const { data: archive, error: insertError } = await db.from("order_archives").insert({
    period_start: window.periodStart, period_end: window.periodEnd, file_name: fileName,
    storage_path: storagePath, order_count: (orders || []).length, item_count: rows.length,
  }).select("*").single();
  if (insertError) {
    await db.storage.from("order-archives").remove([storagePath]);
    return Response.json({ error: "Archive record could not be saved. Original orders were left unchanged." }, { status: 500 });
  }
  const ids = (orders || []).map(order => order.id);
  if (ids.length) {
    const { error: markError } = await db.from("orders").update({ archived_at: new Date().toISOString() }).in("id", ids).is("archived_at", null);
    if (markError) return Response.json({ error: "Excel was created, but source orders could not be marked archived. Keep the archive and retry after checking orders.", archive }, { status: 500 });
  }
  return Response.json({ ok: true, archive, orderCount: (orders || []).length, itemCount: rows.length });
}
