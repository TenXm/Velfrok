"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseAdminBrowser } from "@/lib/supabase-admin-browser";

type AnyRow = Record<string, any>;
type Props = { accessToken: string; initialOrders?: AnyRow[] };
type Option = { id: string; attribute_name: string; attribute_slug: string; value: string; normalized_value: string };
const DELIVERY_PARTNERS = [
  { name: "Amazon Shipping", url: "https://shipping.amazon.in/" },
  { name: "Aramex", url: "https://www.aramex.com/express/track.aspx" },
  { name: "Blitz", url: "https://www.blitz.delivery/" },
  { name: "Blue Dart Express", url: "https://www.bluedart.com/tracking" },
  { name: "Bombino Express", url: "https://www.bombinoexp.com/" },
  { name: "Borzo (WeFast)", url: "https://borzodelivery.com/in" },
  { name: "Delhivery", url: "https://www.delhivery.com/tracking" },
  { name: "DHL Express", url: "https://www.dhl.com/en/express/tracking.html" },
  { name: "Dunzo", url: "https://www.dunzo.com/" },
  { name: "Ekart Logistics", url: "https://ekartlogistics.com/" },
  { name: "FedEx", url: "https://www.fedex.com/en-in/tracking.html" },
  { name: "India Post (Speed Post)", url: "https://www.indiapost.gov.in/_layouts/15/dop.tracking.ui/trackconsignment.aspx" },
  { name: "Pidge", url: "https://www.pidge.in/" },
  { name: "Shadowfax", url: "https://www.shadowfax.in/" },
  { name: "Shree Maruti Courier", url: "https://www.shreemaruticourier.com/" },
  { name: "Shree Tirupati Courier", url: "https://www.shreetirupaticourier.net/" },
  { name: "Smartr Logistics", url: "https://smartr.in/" },
  { name: "The Professional Couriers", url: "https://www.tpcindia.com/" },
  { name: "Trackon Couriers", url: "https://trackon.in/" },
  { name: "UPS (United Parcel Service)", url: "https://www.ups.com/track" },
  { name: "XpressBees", url: "https://www.xpressbees.com/track" },
];
const localDateKey = (value: string) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : [date.getFullYear(), String(date.getMonth()+1).padStart(2,"0"), String(date.getDate()).padStart(2,"0")].join("-"); };
const calendarDateKey = (date: Date) => [date.getFullYear(), String(date.getMonth()+1).padStart(2,"0"), String(date.getDate()).padStart(2,"0")].join("-");

const money = (value: unknown) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value || 0));
const dateText = (value: string) => value ? new Date(value).toLocaleString("en-IN") : "—";
const slug = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function downloadCsv(rows: AnyRow[]) {
  const columns = ["order_number", "customer_name", "mobile", "payment_status", "fulfillment_status", "total_amount", "created_at"];
  const quote = (v: unknown) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
  const csv = [columns.join(","), ...rows.map(row => columns.map(key => quote(row[key])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = "velfrok-orders.csv"; link.click();
  URL.revokeObjectURL(url);
}

function AwbCameraScanner({ onScan, onClose }: { onScan: (value: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [scannerError, setScannerError] = useState("");
  const onScanRef = useRef(onScan);
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);
  useEffect(() => {
    let active = true;
    let stream: MediaStream | null = null;
    let frame = 0;
    const start = async () => {
      try {
        const Detector = (window as any).BarcodeDetector;
        if (!Detector) { setScannerError("Barcode scanning is not supported in this browser. Enter the AWB number manually."); return; }
        if (!navigator.mediaDevices?.getUserMedia) { setScannerError("Camera access is unavailable. Enter the AWB number manually."); return; }
        const detector = new Detector({ formats: ["code_128", "code_39", "qr_code", "ean_13", "ean_8", "upc_a", "upc_e", "itf"] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (!active || !videoRef.current) { stream.getTracks().forEach(track => track.stop()); return; }
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const scan = async () => {
          if (!active || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const value = codes?.find((code: any) => code.rawValue)?.rawValue;
            if (value) { onScanRef.current(String(value).trim()); return; }
          } catch { /* Keep scanning while the camera is active. */ }
          frame = requestAnimationFrame(scan);
        };
        frame = requestAnimationFrame(scan);
      } catch (error) {
        setScannerError(error instanceof Error ? error.message : "Could not start the camera. Enter the AWB number manually.");
      }
    };
    start();
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach(track => track.stop());
    };
  }, []);
  return <div role="dialog" aria-modal="true" aria-label="Scan AWB barcode" style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(0,0,0,.78)",display:"grid",placeItems:"center",padding:16}}>
    <div style={{background:"white",color:"#111",padding:16,borderRadius:12,width:"min(100%,480px)"}}>
      <div className="section-head"><h3>Scan AWB / Barcode</h3><button className="secondary" onClick={onClose}>Close</button></div>
      <video ref={videoRef} playsInline muted style={{width:"100%",minHeight:180,background:"#111",borderRadius:8,objectFit:"cover"}}/>
      <p>{scannerError || "Hold the barcode or QR code inside the camera view."}</p>
      <button className="secondary" onClick={onClose}>Cancel scan</button>
    </div>
  </div>;
}

function AttributePicker({ name, options, selected, onSelected, onAddOption, disabled = false }: {
  name: string; options: Option[]; selected: string[]; onSelected: (values: string[]) => void;
  onAddOption: (name: string, value: string) => Promise<Option | null>; disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const matches = options.filter(o => o.attribute_slug === slug(name) && o.value.toLowerCase().includes(query.trim().toLowerCase()) && !selected.includes(o.value)).slice(0, 8);
  const exact = options.some(o => o.attribute_slug === slug(name) && o.value.toLowerCase() === query.trim().toLowerCase());
  const add = async () => {
    const value = query.trim();
    if (!value) return;
    setSaving(true);
    const option = await onAddOption(name, value);
    setSaving(false);
    if (option) {
      onSelected([...selected, option.value]);
      setQuery("");
      setOpen(false);
    }
  };
  return <div className="field">
    <label>{name}</label>
    <div className="picker">
      <input disabled={disabled} value={query} onFocus={() => setOpen(true)} onChange={e => { setQuery(e.target.value); setOpen(true); }} placeholder={`Search or select ${name.toLowerCase()}...`} />
      {open && <div className="picker-menu">
        {matches.length > 0 ? matches.map(option => <button type="button" key={option.id} onClick={() => { onSelected([...selected, option.value]); setQuery(""); setOpen(false); }}>{option.value}</button>) : query.trim() ? <p className="empty-match">No matching {name.toLowerCase()} found.</p> : <p className="empty-match">Type to search existing options.</p>}
        {query.trim() && !exact && <button type="button" className="add-option" disabled={saving || disabled} onClick={add}>{saving ? "Saving..." : `+ Add “${query.trim()}” as new ${name.toLowerCase()}`}</button>}
        <button type="button" className="close-menu" onClick={() => setOpen(false)}>Close</button>
      </div>}
    </div>
    <div className="chips">{selected.map(value => <span className="chip" key={value}>{value}<button type="button" aria-label={`Remove ${value}`} onClick={() => onSelected(selected.filter(v => v !== value))}>×</button></span>)}</div>
    <small>Search first. If no match appears, add a new option; it will be saved for future products.</small>
  </div>;
}

function CategoryPicker({ categories, value, onChange, onCreate }: {
  categories: AnyRow[]; value: string; onChange: (id: string) => void;
  onCreate: (name: string) => Promise<AnyRow | null>;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const matches = categories.filter(c => c.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8);
  const exact = categories.some(c => c.name.toLowerCase() === query.trim().toLowerCase());
  const add = async () => {
    if (!query.trim()) return;
    const category = await onCreate(query.trim());
    if (category) { onChange(category.id); setQuery(""); setOpen(false); }
  };
  const selected = categories.find(c => c.id === value);
  return <div className="field">
    <label>Category *</label>
    <div className="picker">
      <input value={query} onFocus={() => setOpen(true)} onChange={e => { setQuery(e.target.value); setOpen(true); }} placeholder={selected ? selected.name : "Search existing categories..."}/>
      {open && <div className="picker-menu">
        {matches.map(category => <button type="button" key={category.id} onClick={() => { onChange(category.id); setQuery(""); setOpen(false); }}>{category.name}</button>)}
        {query.trim() && matches.length === 0 && <p className="empty-match">No matching category found.</p>}
        {query.trim() && !exact && <button type="button" className="add-option" onClick={add}>+ Add “{query.trim()}” as new category</button>}
        <button type="button" className="close-menu" onClick={() => setOpen(false)}>Close</button>
      </div>}
    </div>
    {selected && <div className="chips"><span className="chip">{selected.name}<button type="button" onClick={() => onChange("")}>×</button></span></div>}
    <small>Search first. Add a category only when no match is found.</small>
  </div>;
}

export default function AdminWorkspace({ accessToken, initialOrders = [] }: Props) {
  const [tab, setTab] = useState("overview");
  const [orders, setOrders] = useState<AnyRow[]>(initialOrders);
  const [orderArchives, setOrderArchives] = useState<AnyRow[]>([]);
  const [pendingArchiveOrders, setPendingArchiveOrders] = useState<AnyRow[]>([]);
  const [products, setProducts] = useState<AnyRow[]>([]);
  const [categories, setCategories] = useState<AnyRow[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [coupons, setCoupons] = useState<AnyRow[]>([]);
  const [invoiceSettings, setInvoiceSettings] = useState({ business_name: "Velfrok", phone: "", email: "", address: "", gst_number: "", gst_rate: "0", tax_label: "", tax_rate: "0", terms: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [selectedOrderDate, setSelectedOrderDate] = useState("");
  const [orderStatusFilters, setOrderStatusFilters] = useState<string[]>([]);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [deliveryEdits, setDeliveryEdits] = useState<Record<string, { partner: string; awb: string; trackingUrl: string }>>({});
  const [scannerOrderId, setScannerOrderId] = useState<string | null>(null);
  const [stockFilter, setStockFilter] = useState("all");
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [invoiceBusy, setInvoiceBusy] = useState(false);
  const [stockMode, setStockMode] = useState("add");
  const [stockAmount, setStockAmount] = useState("1");
  const [orderEdits, setOrderEdits] = useState<Record<string, { payment: string; fulfillment: string }>>({});
  const [categoryName, setCategoryName] = useState("");
  const [categoryManagerSelection, setCategoryManagerSelection] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [productForm, setProductForm] = useState({
    name: "", sku: "", category_id: "", description: "", mrp: "", selling_price: "", quantity: "0",
    colours: [] as string[], imagesText: "", dimensions: "", weight: "", gst_rate: "0", attributes: {} as Record<string, string[]>, is_active: true,
  });
  const [newAttributeName, setNewAttributeName] = useState("");
  const [customAttributeNames, setCustomAttributeNames] = useState<string[]>([]);
  const [couponForm, setCouponForm] = useState({ code: "", discount_type: "percentage", discount_value: "", min_order_value: "0", max_discount: "", expires_at: "", usage_limit: "", per_customer_limit: "", is_active: true });
  const supabase = useMemo(() => supabaseAdminBrowser(), []);
  const [editingCouponId, setEditingCouponId] = useState<string | null>(null);

  const api = useCallback(async (path: string, init: RequestInit = {}) => {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    const token = sessionData.session?.access_token || accessToken;
    if (!token) throw new Error("Your admin session expired. Sign in again.");
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const response = await fetch(path, {
      ...init,
      headers,
      cache: "no-store",
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Request failed.");
    return result;
  }, [accessToken, supabase]);

  const loadAll = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const [catalog, couponData, orderData, invoiceData] = await Promise.all([
        api("/api/admin/catalog"), api("/api/admin/coupons"), api("/api/admin/orders"), api("/api/admin/invoice-settings"),
      ]);
      setProducts(catalog.products || []);
      setCategories(catalog.categories || []);
      setOptions(catalog.options || []);
      setCoupons(couponData.coupons || []);
      setOrders(orderData.orders || []);
      setInvoiceSettings(invoiceData.settings || invoiceSettings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load admin data.");
    } finally { setBusy(false); }
  }, [api]);

  const loadArchives = useCallback(async () => {
    try {
      const result = await api("/api/admin/order-archives");
      setOrderArchives(result.archives || []);
      setPendingArchiveOrders(result.pendingOrders || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load Order Archive. Apply the archive migration first.");
    }
  }, [api]);

  const deleteOrderArchive = async (archive: AnyRow) => {
    if (!window.confirm(`Permanently delete ${archive.file_name}? This deletes the archived Excel file, not the original order history.`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await api("/api/admin/order-archives", { method: "DELETE", body: JSON.stringify({ id: archive.id }) });
      setMessage("Archived Excel file deleted.");
      await loadArchives();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not delete archive file."); }
    finally { setBusy(false); }
  };

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { if (tab === "order-archive") loadArchives(); }, [tab, loadArchives]);

  const saveInvoiceSettings = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try { const result = await api("/api/admin/invoice-settings", { method: "PUT", body: JSON.stringify(invoiceSettings) }); setInvoiceSettings(result.settings); setMessage("Invoice settings saved."); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save invoice settings."); }
    finally { setBusy(false); }
  };

  const addOption = async (attributeName: string, value: string) => {
    try {
      const result = await api("/api/admin/catalog", { method: "POST", body: JSON.stringify({ action: "option", attributeName, value }) });
      setOptions(old => old.some(option => option.id === result.option.id) ? old : [...old, result.option]);
      setMessage(`Added ${value} to ${attributeName} options.`);
      return result.option as Option;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add option.");
      return null;
    }
  };

  const createCategory = async (name: string) => {
    try {
      const result = await api("/api/admin/catalog", { method: "POST", body: JSON.stringify({ action: "category", name }) });
      setCategories(old => old.some(c => c.id === result.category.id) ? old : [...old, result.category].sort((a,b) => a.name.localeCompare(b.name)));
      setMessage(result.existing ? "Selected existing category." : "New category added.");
      return result.category as AnyRow;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add category.");
      return null;
    }
  };

  const saveCategory = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!categoryName.trim()) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const category = await createCategory(categoryName);
      if (category) setCategoryName("");
    } finally { setBusy(false); }
  };

  const resetProductForm = () => {
    setEditingId(null);
    setProductForm({ name: "", sku: "", category_id: "", description: "", mrp: "", selling_price: "", quantity: "0", colours: [], imagesText: "", dimensions: "", weight: "", gst_rate: "0", attributes: {}, is_active: true });
    setNewAttributeName("");
    setCustomAttributeNames([]);
  };

  const startEditProduct = (product: AnyRow) => {
    setEditingId(product.id);
    setProductForm({
      name: product.name || "", sku: product.sku || "", category_id: product.category_id || "", description: product.description || "",
      mrp: String(product.mrp ?? ""), selling_price: String(product.selling_price ?? ""), quantity: String(product.quantity ?? 0),
      colours: Array.isArray(product.colours) ? product.colours : [], imagesText: Array.isArray(product.images) ? product.images.join("\n") : "",
      dimensions: product.dimensions || "", weight: product.weight || "", gst_rate: String(product.gst_rate ?? 0), attributes: product.attributes && typeof product.attributes === "object" ? product.attributes : {}, is_active: product.is_active !== false,
    });
    setTab("products");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const uploadImages = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const form = new FormData();
      Array.from(files).slice(0, 12).forEach(file => form.append("files", file));
      const result = await api("/api/admin/product-images", { method: "POST", body: form });
      setProductForm(f => ({ ...f, imagesText: [f.imagesText, ...(result.images || [])].filter(Boolean).join("\n") }));
      setMessage(`${(result.images || []).length} product image(s) uploaded.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Image upload failed."); }
    finally { setBusy(false); }
  };

  const imageUrls = productForm.imagesText.split("\n").map(value => value.trim()).filter(Boolean);
  const moveImage = (index: number, direction: number) => {
    const next = [...imageUrls];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setProductForm(f => ({ ...f, imagesText: next.join("\n") }));
  };
  const removeImage = (index: number) => {
    setProductForm(f => ({ ...f, imagesText: f.imagesText.split("\n").filter((_, i) => i !== index).join("\n") }));
  };

  const saveProduct = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!productForm.category_id) { setError("Select a category before saving the product."); return; }
    setBusy(true); setError(""); setMessage("");
    const payload = {
      name: productForm.name, sku: productForm.sku, category_id: productForm.category_id || null,
      description: productForm.description, mrp: Number(productForm.mrp), selling_price: Number(productForm.selling_price),
      quantity: Number(productForm.quantity), colours: productForm.colours,
      images: productForm.imagesText.split("\n").map(v => v.trim()).filter(Boolean),
      dimensions: productForm.dimensions, weight: productForm.weight, gst_rate: Number(productForm.gst_rate), attributes: productForm.attributes, is_active: productForm.is_active,
    };
    try {
      const result = await api("/api/admin/catalog", { method: editingId ? "PATCH" : "POST", body: JSON.stringify(editingId ? { action: "product", id: editingId, product: payload } : { action: "product", product: payload }) });
      setProducts(old => editingId ? old.map(p => p.id === editingId ? result.product : p) : [result.product, ...old]);
      resetProductForm(); setMessage(editingId ? "Product updated." : "Product added.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save product."); }
    finally { setBusy(false); }
  };

  const editAttributeOption = async (option: Option) => {
    const value = window.prompt(`Rename ${option.attribute_name} option`, option.value);
    if (!value || value.trim() === option.value) return;
    try {
      const result = await api("/api/admin/catalog", { method: "PATCH", body: JSON.stringify({ action: "option", id: option.id, value: value.trim() }) });
      setOptions(old => old.map(item => item.id === option.id ? result.option : item));
      setMessage("Parameter option renamed.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not rename option."); }
  };

  const removeAttributeOption = async (option: Option) => {
    if (!window.confirm(`Remove “${option.value}” from future selections? Existing products keep their saved value.`)) return;
    try {
      await api(`/api/admin/catalog?optionId=${encodeURIComponent(option.id)}`, { method: "DELETE" });
      setOptions(old => old.filter(item => item.id !== option.id));
      setMessage("Parameter option removed from future selections.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not remove option."); }
  };

  const archiveProduct = async (id: string) => {
    if (!window.confirm("Archive this product? It will be hidden from the storefront but kept in past orders.")) return;
    try {
      await api(`/api/admin/catalog?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      setProducts(old => old.map(p => p.id === id ? { ...p, is_active: false } : p));
      setMessage("Product archived.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not archive product."); }
  };

  const adjustInventory = async () => {
    if (!selectedProducts.length) { setError("Select at least one product."); return; }
    const amount = Number(stockAmount);
    if (!Number.isInteger(amount) || amount < 0) { setError("Enter a valid whole-number stock quantity."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await api("/api/admin/inventory", { method: "PATCH", body: JSON.stringify({ items: selectedProducts.map(product_id => ({ product_id, mode: stockMode, quantity: amount })) }) });
      const quantities = new Map<string, number>((result.results || []).map((item: AnyRow) => [item.product_id, item.quantity] as [string, number]));
      setProducts(old => old.map(p => quantities.has(p.id) ? { ...p, quantity: quantities.get(p.id) } : p));
      setSelectedProducts([]); setMessage("Inventory updated for selected products.");
    } catch (e) { setError(e instanceof Error ? e.message : "Inventory update failed."); }
    finally { setBusy(false); }
  };

  const downloadInvoices = async (format: "zip" | "combined") => {
    if (!selectedOrders.length) { setError("Select at least one order first."); return; }
    if (selectedOrders.length > 50) { setError("You can generate invoices for up to 50 orders at a time."); return; }
    setInvoiceBusy(true); setError(""); setMessage("");
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const token = sessionData.session?.access_token || accessToken;
      if (!token) throw new Error("Your admin session expired. Sign in again.");
      const response = await fetch("/api/admin/invoices", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: selectedOrders, format }),
        cache: "no-store",
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || "Could not generate invoices.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = format === "zip" ? "velfrok-invoices.zip" : "velfrok-invoices-combined.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      setMessage(`Invoice download started for ${selectedOrders.length} order(s).`);
      setSelectedOrders([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invoice generation failed.");
    } finally {
      setInvoiceBusy(false);
    }
  };

  const runCodAction = async (order: AnyRow, action: "accept_cod" | "reject_cod" | "collect_cod" | "reject_order") => {
    if (action === "reject_order" && !window.confirm(`Reject order ${order.order_number || order.id.slice(0, 8)}? Inventory will remain unchanged.`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await api("/api/admin/orders", { method: "PATCH", body: JSON.stringify({ orderId: order.id, action }) });
      setMessage(action === "reject_order" ? "Order rejected successfully. Inventory was not changed." : "COD order updated successfully.");
      await loadAll();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update order."); }
    finally { setBusy(false); }
  };

  const saveDelivery = async (order: AnyRow) => {
    const edit = deliveryEdits[order.id] || { partner: order.delivery_partner || "", awb: order.awb_number || "", trackingUrl: order.tracking_url || "" };
    setBusy(true); setError(""); setMessage("");
    try {
      await api("/api/admin/orders", { method: "PATCH", body: JSON.stringify({ orderId: order.id, action: "save_delivery", deliveryPartner: edit.partner, awbNumber: edit.awb, trackingUrl: edit.trackingUrl }) });
      setMessage("Courier and AWB details saved.");
      await loadAll();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save delivery details."); }
    finally { setBusy(false); }
  };

  const updateOrder = async (order: AnyRow, field: "payment" | "fulfillment") => {
    const edit = orderEdits[order.id] || { payment: order.payment_status || "pending_utr", fulfillment: order.fulfillment_status || "confirmed" };
    const body = field === "payment" ? { orderId: order.id, paymentStatus: edit.payment } : { orderId: order.id, fulfillmentStatus: edit.fulfillment };
    setBusy(true); setError(""); setMessage("");
    try {
      if (field === "fulfillment" && edit.fulfillment === "delivered" && !window.confirm(`Are you sure you want to mark order ${order.order_number || order.id.slice(0, 8)} as Delivered?`)) return;
      await api("/api/admin/orders", { method: "PATCH", body: JSON.stringify(body) });
      setMessage(field === "fulfillment" && edit.fulfillment === "delivered" ? "Order marked Delivered. It will be included in the monthly archive." : "Order updated successfully.");
      await loadAll();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update order."); }
    finally { setBusy(false); }
  };

  const saveCoupon = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const payload = {
        ...couponForm, discount_value: Number(couponForm.discount_value), min_order_value: Number(couponForm.min_order_value),
        max_discount: couponForm.max_discount || null, usage_limit: couponForm.usage_limit || null,
        per_customer_limit: couponForm.per_customer_limit || null, expires_at: couponForm.expires_at || null,
      };
      const result = await api("/api/admin/coupons", { method: editingCouponId ? "PATCH" : "POST", body: JSON.stringify(editingCouponId ? { ...payload, id: editingCouponId } : payload) });
      setCoupons(old => editingCouponId ? old.map(c => c.id === editingCouponId ? result.coupon : c) : [result.coupon, ...old]);
      setEditingCouponId(null);
      setCouponForm({ code: "", discount_type: "percentage", discount_value: "", min_order_value: "0", max_discount: "", expires_at: "", usage_limit: "", per_customer_limit: "", is_active: true });
      setMessage(editingCouponId ? "Coupon updated." : "Coupon created.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create coupon."); }
    finally { setBusy(false); }
  };

  const editCoupon = (coupon: AnyRow) => {
    setEditingCouponId(coupon.id);
    setCouponForm({
      code: coupon.code || "", discount_type: coupon.discount_type || "percentage",
      discount_value: String(coupon.discount_value ?? ""), min_order_value: String(coupon.min_order_value ?? 0),
      max_discount: coupon.max_discount == null ? "" : String(coupon.max_discount),
      expires_at: coupon.expires_at ? new Date(coupon.expires_at).toISOString().slice(0,16) : "",
      usage_limit: coupon.usage_limit == null ? "" : String(coupon.usage_limit),
      per_customer_limit: coupon.per_customer_limit == null ? "" : String(coupon.per_customer_limit),
      is_active: coupon.is_active !== false,
    });
    setTab("coupons");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleCoupon = async (coupon: AnyRow) => {
    try {
      const result = await api("/api/admin/coupons", { method: "PATCH", body: JSON.stringify({ action: "toggle", id: coupon.id, is_active: !coupon.is_active }) });
      setCoupons(old => old.map(c => c.id === coupon.id ? result.coupon : c));
      setMessage("Coupon status updated.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update coupon."); }
  };

  const deleteCoupon = async (id: string) => {
    if (!window.confirm("Delete this coupon?")) return;
    try { await api(`/api/admin/coupons?id=${encodeURIComponent(id)}`, { method: "DELETE" }); setCoupons(old => old.filter(c => c.id !== id)); setMessage("Coupon deleted."); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not delete coupon."); }
  };

  const filteredProducts = useMemo(() => products.filter(p => {
    const q = productSearch.toLowerCase();
    const matches = !q || [p.name, p.sku].some(v => String(v || "").toLowerCase().includes(q));
    const stock = Number(p.quantity || 0);
    return matches && (stockFilter === "all" || (stockFilter === "low" && stock > 0 && stock < 10) || (stockFilter === "out" && stock === 0));
  }), [products, productSearch, stockFilter]);
  const filteredOrders = orders.filter(o => {
    const acceptance = String(o.order_acceptance_status || "").toLowerCase();
    const fulfillment = String(o.fulfillment_status || "").toLowerCase();
    const status = acceptance === "rejected" ? "rejected"
      : String(o.payment_status || "").toLowerCase() === "rejected" ? "denied"
      : fulfillment === "delivered" || Boolean(o.delivered_at) ? "delivered"
      : fulfillment === "shipped" ? "on_the_way"
      : fulfillment === "ready_to_ship" ? "dispatched"
      : acceptance === "pending" ? "pending"
      : acceptance === "accepted" ? "accepted" : "";
    const matchesStatus = orderStatusFilters.length === 0 ? status !== "delivered" : orderStatusFilters.includes(status);
    const matchesDate = !selectedOrderDate || [o.created_at,o.dispatched_at,o.delivered_at,o.rejected_at].some(value => localDateKey(value || "") === selectedOrderDate);
    const matchesSearch = [o.order_number, o.customer_name, o.mobile].some(v => String(v || "").toLowerCase().includes(orderSearch.toLowerCase()));
    return matchesStatus && matchesDate && matchesSearch;
  });
  const selectedDayOrders = selectedOrderDate ? orders.filter(o => localDateKey(o.created_at) === selectedOrderDate) : [];
  const dayCount = (event: string) => orders.filter(o => event === "dispatched"
    ? localDateKey(o.dispatched_at || "") === selectedOrderDate
    : event === "delivered"
      ? localDateKey(o.delivered_at || "") === selectedOrderDate
      : event === "rejected"
        ? localDateKey(o.rejected_at || "") === selectedOrderDate
        : false).length;
  const calendarDays = useMemo(() => {
    const first = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay());
    return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
  }, [calendarMonth]);
  const calendarCounts = useMemo(() => {
    const counts: Record<string, { orders: number; dispatched: number; delivered: number; rejected: number }> = {};
    const add = (key: string, field: "orders" | "dispatched" | "delivered" | "rejected") => {
      if (!key) return;
      counts[key] ||= { orders: 0, dispatched: 0, delivered: 0, rejected: 0 };
      counts[key][field] += 1;
    };
    orders.forEach(order => {
      add(localDateKey(order.created_at), "orders");
      add(localDateKey(order.dispatched_at || ""), "dispatched");
      add(localDateKey(order.delivered_at || ""), "delivered");
      add(localDateKey(order.rejected_at || ""), "rejected");
    });
    return counts;
  }, [orders]);
  const orderSummaryCounts = useMemo(() => ({
    accepted: orders.filter(o => o.order_acceptance_status === "accepted" && o.fulfillment_status !== "delivered").length,
    rejected: orders.filter(o => o.order_acceptance_status === "rejected").length,
    delivered: orders.filter(o => o.fulfillment_status === "delivered" || Boolean(o.delivered_at)).length,
    on_the_way: orders.filter(o => o.fulfillment_status === "shipped").length,
  }), [orders]);
  const pendingPayments = orders.filter(o => ["pending_utr", "pending_verification"].includes(o.payment_status)).length;
  const revenue = orders.filter(o => o.payment_status === "accepted").reduce((sum,o) => sum + Number(o.total_amount || 0), 0);
  const lowStock = products.filter(p => Number(p.quantity) < 10).length;
  const discountPct = Number(productForm.mrp) > 0 && Number(productForm.selling_price) >= 0 ? Math.max(0, Math.round(((Number(productForm.mrp) - Number(productForm.selling_price)) / Number(productForm.mrp)) * 100)) : 0;
  const attributeNames = Array.from(new Set(["Size", "Size Type", "Size Format", "Material", "Brand", "Pattern", "GST Rate", ...options.map(o => o.attribute_name), ...customAttributeNames]));

  const styles = `
    .admin-workspace{color:#f3f4fa}.admin-tabs{display:flex;gap:8px;overflow:auto;padding:18px 0}.admin-tabs button{white-space:nowrap;border:1px solid #343147;border-radius:9px;background:#141522;color:#c9c6d8;padding:10px 14px;cursor:pointer}.admin-tabs button.active{background:#8466df;border-color:#8466df;color:#fff}.admin-card{background:#141522;border:1px solid #343147;border-radius:14px;padding:18px;margin:14px 0}.admin-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.admin-stat{background:#141522;border:1px solid #343147;border-radius:12px;padding:16px}.admin-stat span{font-size:12px;color:#a5a6b8}.admin-stat strong{display:block;font-size:25px;margin-top:8px}.admin-workspace h2{font-size:19px;margin:0 0 14px}.admin-workspace h3{font-size:15px;margin:16px 0 8px}.admin-workspace p,.admin-workspace small{color:#a5a6b8}.admin-workspace small{display:block;font-size:11px;margin-top:5px}.admin-workspace label{display:block;font-size:12px;color:#c9c6d8;margin:0 0 6px}.admin-workspace input,.admin-workspace select,.admin-workspace textarea{width:100%;padding:11px 12px;border:1px solid #45415b;border-radius:8px;background:#10111e;color:#f3f4fa;outline:none}.admin-workspace textarea{min-height:85px;resize:vertical}.admin-workspace button.primary{border:0;border-radius:8px;background:#8466df;color:#fff;padding:11px 15px;font-weight:700;cursor:pointer}.admin-workspace button.secondary{border:1px solid #48445e;border-radius:8px;background:transparent;color:#ddd5ff;padding:10px 13px;cursor:pointer}.admin-workspace button.danger{border:1px solid #75414b;border-radius:8px;background:#351b25;color:#ffc4cb;padding:8px 10px;cursor:pointer}.admin-workspace button:disabled{opacity:.5;cursor:wait}.admin-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.field{position:relative;min-width:0}.picker{position:relative}.picker-menu{position:absolute;z-index:20;top:calc(100% + 4px);left:0;right:0;max-height:240px;overflow:auto;background:#202033;border:1px solid #514b70;border-radius:9px;padding:6px;box-shadow:0 12px 28px #0008}.picker-menu button{display:block;width:100%;text-align:left;background:transparent;color:#f3f4fa;border:0;border-radius:6px;padding:9px;cursor:pointer}.picker-menu button:hover{background:#35304b}.picker-menu .add-option{color:#c7b9ff;border-top:1px solid #46415c;margin-top:4px}.picker-menu .close-menu{color:#a5a6b8;font-size:11px}.empty-match{padding:5px 8px;font-size:12px}.chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}.chip{display:inline-flex;align-items:center;gap:6px;border:1px solid #50496c;background:#252039;border-radius:20px;padding:4px 9px;font-size:12px}.chip button{background:transparent;border:0;color:#fff;cursor:pointer;font-size:16px}.admin-table-wrap{overflow:auto}.admin-table{width:100%;border-collapse:collapse;min-width:760px;font-size:12px}.admin-table th,.admin-table td{text-align:left;padding:11px 9px;border-bottom:1px solid #292b3b;vertical-align:middle}.admin-table th{color:#aaa4c5;font-weight:600}.admin-table select{min-width:145px;padding:8px}.inline-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.notice{padding:11px 13px;border-radius:9px;margin:12px 0;background:#28233b;color:#d7caff;font-size:13px}.notice.error{background:#351b25;color:#ffc4cb}.form-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:14px}.section-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.product-form{display:grid;gap:13px}.product-row{display:flex;gap:8px;align-items:center}.product-row>*{flex:1}.image-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:9px;margin-top:10px}.image-item{display:flex;gap:9px;align-items:center;padding:8px;border:1px solid #343147;border-radius:9px;background:#10111e}.image-item img{width:58px;height:58px;object-fit:cover;border-radius:6px;background:#252536}.image-item strong{font-size:11px;display:block;margin-bottom:5px}.muted-text{color:#999bb0;font-size:11px}@media(max-width:760px){.admin-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.admin-fields{grid-template-columns:1fr}.admin-card{padding:13px}.admin-stat strong{font-size:21px}}
  `;

  return <section className="admin-workspace">
    <style>{styles}</style>
    <nav className="admin-tabs">
      {[["overview","Overview"],["orders","Orders"],["order-archive","Order Archive"],["products","Products"],["inventory","Inventory"],["coupons","Coupons"],["invoice-settings","Invoice Settings"]].map(([id,label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>)}
      <button className="secondary" onClick={loadAll} disabled={busy}>↻ Refresh</button>
    </nav>
    {error && <div className="notice error">{error}</div>}
    {message && <div className="notice">{message}</div>}
    {busy && <p>Saving / loading…</p>}

    {tab === "overview" && <>
      <div className="admin-grid">
        <div className="admin-stat"><span>Total orders</span><strong>{orders.length}</strong></div>
        <div className="admin-stat"><span>Pending UTR / verification</span><strong>{pendingPayments}</strong></div>
        <div className="admin-stat"><span>Accepted revenue</span><strong>{money(revenue)}</strong></div>
        <div className="admin-stat"><span>Low-stock products (&lt;10)</span><strong>{lowStock}</strong></div>
      </div>
      <div className="admin-card">
        <div className="section-head"><h2>Recent orders</h2><button className="secondary" onClick={() => setTab("orders")}>Manage orders</button></div>
        {orders.length === 0 ? <p>No customer orders yet.</p> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Order</th><th>Customer</th><th>Payment</th><th>Fulfilment</th><th>Total</th><th>Date</th></tr></thead><tbody>{orders.slice(0,8).map(o => <tr key={o.id}><td>{o.order_number || o.id.slice(0,8)}</td><td>{o.customer_name}<br/><span className="muted-text">{o.mobile}</span></td><td>{o.payment_status}</td><td>{o.fulfillment_status}</td><td>{money(o.total_amount)}</td><td>{dateText(o.created_at)}</td></tr>)}</tbody></table></div>}
      </div>
    </>}

    {tab === "orders" && <div className="admin-card">
      <div className="section-head"><h2>Order management</h2><div className="inline-actions"><input style={{width:220}} value={orderSearch} onChange={e => setOrderSearch(e.target.value)} placeholder="Search order / customer"/><button className="secondary" onClick={() => downloadCsv(filteredOrders)}>Export CSV</button></div></div>
      <div className="inline-actions" style={{margin:"12px 0",justifyContent:"flex-start",gap:10,flexWrap:"wrap"}}>
        <button type="button" className="secondary" aria-expanded={calendarOpen} aria-label={calendarOpen ? "Close order calendar" : "Open order calendar"} onClick={() => setCalendarOpen(open => !open)} style={{minWidth:44}}>{calendarOpen ? "✕" : "📅"}</button>
        <select aria-label="Overall order summary filter" style={{maxWidth:270}} value={orderStatusFilters[0] || "all"} onChange={e => setOrderStatusFilters(e.target.value === "all" ? [] : [e.target.value])}>
          <option value="all">All Orders ({orders.length})</option>
          <option value="accepted">Accepted Orders ({orderSummaryCounts.accepted})</option>
          <option value="rejected">Rejected Orders ({orderSummaryCounts.rejected})</option>
          <option value="delivered">Delivered Orders ({orderSummaryCounts.delivered})</option>
          <option value="on_the_way">On the Way ({orderSummaryCounts.on_the_way})</option>
          <option value="dispatched">Order Dispatched</option>
          <option value="denied">Denied Orders</option>
          <option value="pending">Pending Orders</option>
        </select>
        {selectedOrderDate && <span className="muted-text">Date: {new Date(selectedOrderDate+"T00:00:00").toLocaleDateString("en-IN")}</span>}
      </div>
      {calendarOpen && <div className="admin-card" style={{marginBottom:14}}>
        <div className="section-head" style={{flexWrap:"wrap",gap:10}}><h3>Order calendar</h3><div className="inline-actions" style={{flexWrap:"wrap"}}><button className="secondary" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()-1,1))}>‹</button><strong>{calendarMonth.toLocaleDateString("en-IN",{month:"long",year:"numeric"})}</strong><button className="secondary" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+1,1))}>›</button></div></div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,minmax(0,1fr))",gap:5,textAlign:"center"}}>
          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(day => <small key={day} className="muted-text" style={{padding:5}}>{day}</small>)}
          {calendarDays.map(date => { const key=calendarDateKey(date); const counts=calendarCounts[key] || {orders:0,dispatched:0,delivered:0,rejected:0}; const inMonth=date.getMonth()===calendarMonth.getMonth(); const selected=selectedOrderDate===key; return <button key={key} type="button" className="secondary" onClick={() => setSelectedOrderDate(key)} style={{minWidth:0,minHeight:54,padding:"5px 2px",opacity:inMonth?1:.38,border:selected?"2px solid #6b55c5":undefined,background:selected?"#eee9ff":undefined,color:selected?"#33206f":undefined}}><strong>{date.getDate()}</strong>{counts.orders+counts.dispatched+counts.delivered+counts.rejected>0 && <div style={{fontSize:10,lineHeight:1.3,marginTop:2}}>{counts.orders>0 && <span title="Orders">●{counts.orders} </span>}{counts.dispatched>0 && <span title="Dispatched" style={{color:"#2563eb"}}>●{counts.dispatched} </span>}{counts.delivered>0 && <span title="Delivered" style={{color:"#15803d"}}>●{counts.delivered} </span>}{counts.rejected>0 && <span title="Rejected" style={{color:"#dc2626"}}>●{counts.rejected}</span>}</div>}</button>; })}
        </div>
        <p className="muted-text" style={{marginTop:8}}>● Orders placed　<span style={{color:"#2563eb"}}>●</span> Dispatched　<span style={{color:"#15803d"}}>●</span> Delivered　<span style={{color:"#dc2626"}}>●</span> Rejected</p>
        <div className="inline-actions" style={{justifyContent:"space-between",marginTop:8}}><strong>{selectedOrderDate ? new Date(selectedOrderDate+"T00:00:00").toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"}) : "Select a date to filter orders"}</strong><div className="inline-actions"><button className="secondary" onClick={() => setSelectedOrderDate("")}>Show all dates</button><button className="secondary" onClick={() => setCalendarOpen(false)}>Close calendar</button></div></div>
        {selectedOrderDate && <div className="admin-grid" style={{marginTop:12}}><div className="admin-stat"><span>Orders placed</span><strong>{selectedDayOrders.length}</strong></div><div className="admin-stat"><span>Dispatched</span><strong>{dayCount("dispatched")}</strong></div><div className="admin-stat"><span>Delivered</span><strong>{dayCount("delivered")}</strong></div><div className="admin-stat"><span>Rejected</span><strong>{dayCount("rejected")}</strong></div></div>}
      </div>}
      <div className="inline-actions" style={{margin:"12px 0",justifyContent:"space-between"}}>
        <label style={{display:"flex",alignItems:"center",gap:8,margin:0}}>
          <input type="checkbox" style={{width:16,padding:0,height:16,accentColor:"#8466df"}} checked={filteredOrders.length > 0 && filteredOrders.every(o => selectedOrders.includes(o.id))} onChange={event => setSelectedOrders(old => event.target.checked ? Array.from(new Set([...old, ...filteredOrders.map(o => o.id)])) : old.filter(id => !filteredOrders.some(o => o.id === id)))}/>
          Select all matching
        </label>
        <span className="muted-text">{selectedOrders.length} selected</span>
        <button className="primary" disabled={invoiceBusy || selectedOrders.length === 0 || selectedOrders.length > 50} onClick={() => downloadInvoices("zip")}>{invoiceBusy ? "Generating…" : "Download ZIP"}</button>
        <button className="secondary" disabled={invoiceBusy || selectedOrders.length === 0 || selectedOrders.length > 50} onClick={() => downloadInvoices("combined")}>{invoiceBusy ? "Generating…" : "Download Combined PDF"}</button>
      </div>
      {filteredOrders.length === 0 ? <p>No matching orders.</p> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Select</th><th>Order / Customer</th><th>Items</th><th>Payment / Acceptance</th><th>Fulfilment</th><th>Courier &amp; AWB</th><th>Amount</th><th>Update</th></tr></thead><tbody>{filteredOrders.map(o => {
        const edit = orderEdits[o.id] || { payment: o.payment_status || "pending_utr", fulfillment: o.fulfillment_status || "confirmed" };
        const next = ({ confirmed: "packed", packed: "ready_to_ship", ready_to_ship: "shipped", shipped: "delivered" } as Record<string,string>)[o.fulfillment_status] || o.fulfillment_status;
        return <tr key={o.id}>
          <td><input aria-label={`Select invoice for ${o.order_number || o.id.slice(0,8)}`} type="checkbox" style={{width:16,padding:0,height:16,accentColor:"#8466df"}} checked={selectedOrders.includes(o.id)} onChange={event => setSelectedOrders(old => event.target.checked ? [...old, o.id] : old.filter(id => id !== o.id))}/></td>
          <td><strong>{o.order_number || o.id.slice(0,8)}</strong><br/>{o.customer_name}<br/><span className="muted-text">{o.mobile} · {o.city} · {o.pin_code || o.pincode}</span></td>
          <td>{(o.order_items || []).map((it: AnyRow) => <div key={it.id}>{it.product_name} × {it.quantity}<br/><span className="muted-text">{it.sku}</span></div>)}</td>
          <td><strong>{o.payment_method?.toUpperCase() || "UPI"} · {o.payment_status}</strong><br/><span className="muted-text">Acceptance: {o.order_acceptance_status || "pending"} · UTR: {o.utr_number || "—"}</span>{o.payment_method === "cod" ? <div className="inline-actions" style={{marginTop:6}}>{o.order_acceptance_status === "pending" && <><button className="primary" disabled={busy} onClick={() => runCodAction(o,"accept_cod")}>Accept COD</button></>}{o.fulfillment_status === "delivered" && o.payment_status === "due_on_delivery" && <button className="primary" disabled={busy} onClick={() => runCodAction(o,"collect_cod")}>Record cash received</button>}</div> : <><select value={edit.payment} onChange={e => setOrderEdits(old => ({...old,[o.id]:{...edit,payment:e.target.value}}))}><option value="accepted">Accept payment</option><option value="rejected">Reject payment</option><option value="pending_utr" disabled>Pending UTR (read only)</option><option value="pending_verification" disabled>Pending verification (read only)</option></select><button className="primary" style={{marginTop:6}} disabled={busy || !["accepted","rejected"].includes(edit.payment) || edit.payment === o.payment_status} onClick={() => updateOrder(o,"payment")}>Submit payment</button></>}{o.order_acceptance_status === "pending" && <button className="danger" style={{marginTop:6}} disabled={busy} onClick={() => runCodAction(o,"reject_order")}>Reject order</button>}</td>
          <td><strong>{{confirmed:"Order Confirmed",packed:"Order Packed",ready_to_ship:"Order Dispatched",shipped:"On the Way",delivered:"Delivered"}[o.fulfillment_status] || o.fulfillment_status}</strong><select value={edit.fulfillment} onChange={e => setOrderEdits(old => ({...old,[o.id]:{...edit,fulfillment:e.target.value}}))}><option value={o.fulfillment_status}>{{confirmed:"Order Confirmed",packed:"Order Packed",ready_to_ship:"Order Dispatched",shipped:"On the Way",delivered:"Delivered"}[o.fulfillment_status] || o.fulfillment_status}</option>{next !== o.fulfillment_status && <option value={next}>{{confirmed:"Order Confirmed",packed:"Order Packed",ready_to_ship:"Order Dispatched",shipped:"On the Way",delivered:"Delivered"}[next] || next}</option>}</select><button className="primary" style={{marginTop:6}} disabled={busy || edit.fulfillment === o.fulfillment_status || o.order_acceptance_status !== "accepted" || (o.payment_method !== "cod" && o.payment_status !== "accepted")} onClick={() => updateOrder(o,"fulfillment")}>Submit status</button></td>
          <td>{o.order_acceptance_status === "accepted" && ["packed","ready_to_ship","shipped"].includes(o.fulfillment_status) && <div style={{marginTop:10,minWidth:190}}>
              <label>Courier Company</label><select value={(deliveryEdits[o.id]?.partner ?? o.delivery_partner) || ""} onChange={e => { const selected = DELIVERY_PARTNERS.find(item => item.name === e.target.value); setDeliveryEdits(old => ({...old,[o.id]:{partner:e.target.value,awb:old[o.id]?.awb ?? o.awb_number ?? "",trackingUrl:selected?.url || ""}})); }}><option value="">Select Courier Company</option>{DELIVERY_PARTNERS.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}</select>
              {(deliveryEdits[o.id]?.partner || o.delivery_partner) && <>
                <label style={{marginTop:5}}>AWB Number</label><input value={(deliveryEdits[o.id]?.awb ?? o.awb_number) || ""} onChange={e => setDeliveryEdits(old => ({...old,[o.id]:{partner:old[o.id]?.partner ?? o.delivery_partner ?? "",awb:e.target.value,trackingUrl:old[o.id]?.trackingUrl ?? o.tracking_url ?? ""}}))} placeholder="Enter AWB number"/>
                <button className="secondary" type="button" style={{marginTop:5}} onClick={() => setScannerOrderId(o.id)}>▣ Scan AWB</button>
                {scannerOrderId === o.id && <AwbCameraScanner onScan={async value => {
                  const awb = String(value).trim();
                  const partner = deliveryEdits[o.id]?.partner || o.delivery_partner || "";
                  const selected = DELIVERY_PARTNERS.find(item => item.name === partner);
                  if (!partner || !awb) { setError("Select a courier company before scanning the AWB."); setScannerOrderId(null); return; }
                  setBusy(true); setError(""); setMessage("");
                  try {
                    await api("/api/admin/orders", { method: "PATCH", body: JSON.stringify({ orderId: o.id, action: "save_delivery", deliveryPartner: partner, awbNumber: awb, trackingUrl: selected?.url || o.tracking_url || "" }) });
                    setMessage("AWB scanned and saved to this order.");
                    setScannerOrderId(null);
                    await loadAll();
                  } catch (e) { setError(e instanceof Error ? e.message : "Could not save scanned AWB."); setScannerOrderId(null); }
                  finally { setBusy(false); }
                }} onClose={() => setScannerOrderId(null)}/>}
                <button className="secondary" style={{marginTop:6}} disabled={busy || !(deliveryEdits[o.id]?.awb ?? o.awb_number)} onClick={() => saveDelivery(o)}>Save AWB</button>
                {o.awb_number && <p className="muted-text" style={{marginTop:4}}>{o.delivery_partner} · {o.awb_number}{o.tracking_url && <> · <a href={o.tracking_url} target="_blank" rel="noreferrer">Track parcel</a></>}</p>}
              </>}
            </div>}
          </td>
          <td>{money(o.total_amount)}</td>
          <td>{dateText(o.created_at)}<br/><span className="muted-text">{o.address || o.street_address || ""}</span></td>
        </tr>;
      })}</tbody></table></div>}
    </div>}


    {tab === "order-archive" && <div className="admin-card">
      <div className="section-head"><h2>Order Archive</h2><button className="secondary" onClick={loadArchives}>↻ Refresh archive</button></div>
      <p>Delivered orders remain here until the next monthly Excel report is successfully created. The monthly file is generated on the first day of the following month.</p>
      <h3>Delivered orders awaiting monthly archive ({pendingArchiveOrders.length})</h3>
      {pendingArchiveOrders.length === 0 ? <p>No delivered orders are waiting for the monthly report.</p> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Order</th><th>Customer</th><th>Delivered</th><th>Amount</th></tr></thead><tbody>{pendingArchiveOrders.map(order => <tr key={order.id}><td>{order.order_number || order.id.slice(0,8)}</td><td>{order.customer_name}</td><td>{dateText(order.delivered_at)}</td><td>{money(order.total_amount)}</td></tr>)}</tbody></table></div>}
      <h3>Monthly Excel files ({orderArchives.length})</h3>
      {orderArchives.length === 0 ? <p>No monthly Excel files have been created yet.</p> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Report</th><th>Period</th><th>Orders</th><th>Created</th><th>Actions</th></tr></thead><tbody>{orderArchives.map(archive => <tr key={archive.id}><td><strong>{archive.file_name}</strong></td><td>{archive.period_start} – {archive.period_end}</td><td>{archive.order_count}</td><td>{dateText(archive.generated_at)}</td><td><div className="inline-actions">{archive.download_url && <a className="secondary" href={archive.download_url} target="_blank" rel="noreferrer">Download Excel</a>}<button className="danger" onClick={() => deleteOrderArchive(archive)}>Delete file</button></div></td></tr>)}</tbody></table></div>}
    </div>}

    {tab === "products" && <>
      <div className="admin-card">
        <div className="section-head"><h2>{editingId ? "Edit product" : "Add new product"}</h2>{editingId && <button className="secondary" onClick={resetProductForm}>Cancel edit</button>}</div>
        <form className="product-form" onSubmit={saveProduct}>
          <div className="admin-fields">
            <div className="field"><label>Product name *</label><input required value={productForm.name} onChange={e => setProductForm(f => ({...f,name:e.target.value}))} placeholder="Enter product name"/></div>
            <div className="field"><label>SKU / Product code *</label><input required value={productForm.sku} onChange={e => setProductForm(f => ({...f,sku:e.target.value.toUpperCase()}))} placeholder="e.g. VEL-001"/></div>
            <CategoryPicker categories={categories} value={productForm.category_id} onChange={id => setProductForm(f => ({...f,category_id:id}))} onCreate={createCategory}/>
            <div className="field"><label>Product status</label><select value={productForm.is_active ? "active" : "inactive"} onChange={e => setProductForm(f => ({...f,is_active:e.target.value==="active"}))}><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
            <div className="field"><label>MRP (₹) *</label><input required type="number" min="0.01" step="0.01" value={productForm.mrp} onChange={e => setProductForm(f => ({...f,mrp:e.target.value}))}/></div>
            <div className="field"><label>Selling price (₹) * — GST included</label><input required type="number" min="0.01" step="0.01" value={productForm.selling_price} onChange={e => setProductForm(f => ({...f,selling_price:e.target.value}))}/><small>Final tax-inclusive price; GST will not be added at checkout. Automatic discount: {discountPct}%</small></div>
            <div className="field"><label>Product GST rate</label><select value={productForm.gst_rate} onChange={e => setProductForm(f => ({...f,gst_rate:e.target.value}))}><option value="0">0%</option><option value="5">5%</option><option value="10">10%</option><option value="12">12%</option><option value="18">18%</option><option value="28">28%</option></select><small>Change this product’s rate here. Past orders retain their original rate.</small></div>
            <div className="field"><label>Stock quantity *</label><input required type="number" min="0" step="1" value={productForm.quantity} onChange={e => setProductForm(f => ({...f,quantity:e.target.value}))}/></div>
            <div className="field"><label>Weight</label><input value={productForm.weight} onChange={e => setProductForm(f => ({...f,weight:e.target.value}))} placeholder="e.g. 500 g"/></div>
            <div className="field"><label>Dimensions</label><input value={productForm.dimensions} onChange={e => setProductForm(f => ({...f,dimensions:e.target.value}))} placeholder="e.g. 20 × 10 × 5 cm"/></div>
          </div>
          <div className="field"><label>Description</label><textarea value={productForm.description} onChange={e => setProductForm(f => ({...f,description:e.target.value}))} placeholder="Product details, specifications and care instructions"/></div>
          <h3>Product attributes</h3>
          <div className="admin-fields">
            <AttributePicker name="Colour" options={options} selected={productForm.colours} onSelected={values => setProductForm(f => ({...f,colours:values}))} onAddOption={addOption}/>
            {attributeNames.filter(n => slug(n) !== "colour").map(name => <AttributePicker key={slug(name)} name={name} options={options} selected={productForm.attributes[slug(name)] || []} onSelected={values => setProductForm(f => ({...f,attributes:{...f.attributes,[slug(name)]:values}}))} onAddOption={addOption}/>)}
          </div>
          <div className="field"><label>Add another parameter</label><div className="product-row"><input value={newAttributeName} onChange={e => setNewAttributeName(e.target.value)} placeholder="e.g. Finish, Style, Capacity"/><button type="button" className="secondary" onClick={() => { const n = newAttributeName.trim(); if (n && !attributeNames.some(v => slug(v) === slug(n))) { setCustomAttributeNames(old => [...old,n]); setProductForm(f => ({...f,attributes:{...f.attributes,[slug(n)]:[]}})); } setNewAttributeName(""); }}>Add parameter field</button></div><small>New parameter fields are reusable; their individual values are added through the searchable dropdown.</small></div>
          <div className="field"><label>Upload product images (JPG, PNG or WebP · max 5 MB each)</label><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e => { void uploadImages(e.target.files); e.currentTarget.value = ""; }}/><small>Uploads go to the private admin upload endpoint and are stored in the public product-images bucket. Up to 12 images per upload.</small></div>
          <div className="field"><label>Product image URLs (one URL per line)</label><textarea value={productForm.imagesText} onChange={e => setProductForm(f => ({...f,imagesText:e.target.value}))} placeholder={"https://.../main-product.webp\nhttps://.../second-angle.webp"}/><small>The first image is the main product image. Use the arrows to reorder images or remove one before saving.</small>
            <div className="image-list">{imageUrls.map((url,index) => <div className="image-item" key={url + index}><img src={url} alt={`Product image ${index+1}`} /><div><strong>{index === 0 ? "Main image" : `Image ${index+1}`}</strong><div className="inline-actions"><button type="button" className="secondary" disabled={index===0} onClick={() => moveImage(index,-1)}>↑</button><button type="button" className="secondary" disabled={index===imageUrls.length-1} onClick={() => moveImage(index,1)}>↓</button><button type="button" className="danger" onClick={() => removeImage(index)}>Remove</button></div></div></div>)}</div>
          </div>
          <div className="form-actions"><button className="primary" disabled={busy}>{busy ? "Saving..." : editingId ? "Submit product changes" : "Submit new product"}</button><button type="button" className="secondary" onClick={resetProductForm}>Clear form</button></div>
        </form>
      </div>

      <div className="admin-card">
        <div className="section-head"><h2>Categories</h2><span className="muted-text">{categories.length} total</span></div>
        <CategoryPicker categories={categories} value={categoryManagerSelection} onChange={setCategoryManagerSelection} onCreate={createCategory}/>
        <div className="chips">{categories.map(c => <span className="chip" key={c.id}>{c.name}</span>)}</div>
      </div>

      <div className="admin-card">
        <h2>Saved product parameters</h2>
        <p>Rename or remove values from future dropdown selections. Existing products keep their saved values.</p>
        {options.length === 0 ? <p>No custom parameter values yet.</p> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Parameter</th><th>Saved value</th><th>Actions</th></tr></thead><tbody>{options.map(option => <tr key={option.id}><td>{option.attribute_name}</td><td>{option.value}</td><td><div className="inline-actions"><button className="secondary" onClick={() => editAttributeOption(option)}>Rename</button><button className="danger" onClick={() => removeAttributeOption(option)}>Remove</button></div></td></tr>)}</tbody></table></div>}
      </div>

      <div className="admin-card">
        <div className="section-head"><h2>Product catalogue</h2><input style={{maxWidth:260}} value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="Search name or SKU"/></div>
        <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filteredProducts.map(p => <tr key={p.id}><td><strong>{p.name}</strong><br/><span className="muted-text">{p.sku}</span></td><td>{categories.find(c => c.id === p.category_id)?.name || "—"}</td><td>{money(p.selling_price)}<br/><span className="muted-text">MRP {money(p.mrp)}</span></td><td>{p.quantity}</td><td>{p.is_active ? "Active" : "Inactive"}</td><td><div className="inline-actions"><button className="secondary" onClick={() => startEditProduct(p)}>Edit</button>{p.is_active && <button className="danger" onClick={() => archiveProduct(p.id)}>Archive</button>}</div></td></tr>)}</tbody></table></div>
      </div>
    </>}

    {tab === "inventory" && <div className="admin-card">
      <div className="section-head"><h2>Inventory management</h2><select style={{maxWidth:180}} value={stockFilter} onChange={e => setStockFilter(e.target.value)}><option value="all">All stock</option><option value="low">Low stock (&lt;10)</option><option value="out">Out of stock</option></select></div>
      <div className="form-actions"><select style={{maxWidth:180}} value={stockMode} onChange={e => setStockMode(e.target.value)}><option value="add">Add stock (+)</option><option value="subtract">Deduct stock (−)</option><option value="set">Set exact stock (=)</option></select><input style={{maxWidth:150}} type="number" min="0" step="1" value={stockAmount} onChange={e => setStockAmount(e.target.value)} aria-label="Stock quantity"/><button className="primary" disabled={busy || !selectedProducts.length} onClick={adjustInventory}>Submit for {selectedProducts.length} selected</button></div>
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th><input type="checkbox" checked={filteredProducts.length > 0 && filteredProducts.every(p => selectedProducts.includes(p.id))} onChange={e => setSelectedProducts(e.target.checked ? Array.from(new Set([...selectedProducts,...filteredProducts.map(p=>p.id)])) : selectedProducts.filter(id => !filteredProducts.some(p=>p.id===id)))} /></th><th>Product</th><th>SKU</th><th>Current stock</th></tr></thead><tbody>{filteredProducts.map(p => <tr key={p.id}><td><input type="checkbox" checked={selectedProducts.includes(p.id)} onChange={e => setSelectedProducts(old => e.target.checked ? [...old,p.id] : old.filter(id=>id!==p.id))}/></td><td>{p.name}</td><td>{p.sku}</td><td>{p.quantity}</td></tr>)}</tbody></table></div>
      <small>Bulk changes run through one database transaction. A change that would make any selected stock negative is rejected in full.</small>
    </div>}

    {tab === "invoice-settings" && <div className="admin-card">
      <h2>Invoice Settings</h2>
      <p>এই তথ্য ZIP এবং Combined PDF ইনভয়েসে ব্যবহার হবে। Tax rate 0 রাখলে সংশ্লিষ্ট tax যোগ হবে না।</p>
      <form className="product-form" onSubmit={saveInvoiceSettings}>
        <div className="admin-fields">
          <div className="field"><label>Business / Display name</label><input value={invoiceSettings.business_name} onChange={e => setInvoiceSettings(s => ({...s,business_name:e.target.value}))} /></div>
          <div className="field"><label>Mobile number</label><input value={invoiceSettings.phone} onChange={e => setInvoiceSettings(s => ({...s,phone:e.target.value}))} /></div>
          <div className="field"><label>Gmail / Email</label><input type="email" value={invoiceSettings.email} onChange={e => setInvoiceSettings(s => ({...s,email:e.target.value}))} /></div>
          <div className="field"><label>GSTIN</label><input value={invoiceSettings.gst_number} onChange={e => setInvoiceSettings(s => ({...s,gst_number:e.target.value}))} /></div>
          <div className="field"><label>GST rate (%)</label><input type="number" min="0" max="100" step="0.01" value={invoiceSettings.gst_rate} onChange={e => setInvoiceSettings(s => ({...s,gst_rate:e.target.value}))} /></div>
          <div className="field"><label>Other tax name</label><input placeholder="e.g. Service Tax" value={invoiceSettings.tax_label} onChange={e => setInvoiceSettings(s => ({...s,tax_label:e.target.value}))} /></div>
          <div className="field"><label>Other tax rate (%)</label><input type="number" min="0" max="100" step="0.01" value={invoiceSettings.tax_rate} onChange={e => setInvoiceSettings(s => ({...s,tax_rate:e.target.value}))} /></div>
        </div>
        <div className="field"><label>Business address</label><textarea value={invoiceSettings.address} onChange={e => setInvoiceSettings(s => ({...s,address:e.target.value}))} /></div>
        <div className="field"><label>Terms & Conditions</label><textarea value={invoiceSettings.terms} onChange={e => setInvoiceSettings(s => ({...s,terms:e.target.value}))} placeholder="Invoice footer terms..." /></div>
        <button className="primary" disabled={busy}>{busy ? "Saving..." : "Save Invoice Settings"}</button>
      </form>
    </div>}

    {tab === "coupons" && <>
      <div className="admin-card"><div className="section-head"><h2>{editingCouponId ? "Edit coupon" : "Create coupon"}</h2>{editingCouponId && <button type="button" className="secondary" onClick={() => { setEditingCouponId(null); setCouponForm({ code: "", discount_type: "percentage", discount_value: "", min_order_value: "0", max_discount: "", expires_at: "", usage_limit: "", per_customer_limit: "", is_active: true }); }}>Cancel edit</button>}</div><form onSubmit={saveCoupon} className="product-form">
        <div className="admin-fields">
          <div className="field"><label>Coupon code *</label><input required value={couponForm.code} onChange={e => setCouponForm(f => ({...f,code:e.target.value.toUpperCase()}))} placeholder="WELCOME15"/></div>
          <div className="field"><label>Discount type *</label><select value={couponForm.discount_type} onChange={e => setCouponForm(f => ({...f,discount_type:e.target.value}))}><option value="percentage">Percentage (%)</option><option value="flat">Flat (₹)</option></select></div>
          <div className="field"><label>Discount value *</label><input required type="number" min="0.01" step="0.01" value={couponForm.discount_value} onChange={e => setCouponForm(f => ({...f,discount_value:e.target.value}))}/></div>
          <div className="field"><label>Minimum order value (₹)</label><input type="number" min="0" step="0.01" value={couponForm.min_order_value} onChange={e => setCouponForm(f => ({...f,min_order_value:e.target.value}))}/></div>
          <div className="field"><label>Maximum discount cap (₹)</label><input type="number" min="0" step="0.01" value={couponForm.max_discount} onChange={e => setCouponForm(f => ({...f,max_discount:e.target.value}))}/></div>
          <div className="field"><label>Expiry date</label><input type="datetime-local" value={couponForm.expires_at} onChange={e => setCouponForm(f => ({...f,expires_at:e.target.value}))}/></div>
          <div className="field"><label>Total usage limit</label><input type="number" min="1" step="1" value={couponForm.usage_limit} onChange={e => setCouponForm(f => ({...f,usage_limit:e.target.value}))}/></div>
          <div className="field"><label>Per-customer limit</label><input type="number" min="1" step="1" value={couponForm.per_customer_limit} onChange={e => setCouponForm(f => ({...f,per_customer_limit:e.target.value}))}/></div>
        </div>
        <button className="primary" disabled={busy}>{editingCouponId ? "Submit coupon changes" : "Submit new coupon"}</button>
      </form></div>
      <div className="admin-card"><h2>Coupon codes</h2><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Code</th><th>Discount</th><th>Minimum order</th><th>Expiry</th><th>Status</th><th>Actions</th></tr></thead><tbody>{coupons.map(c => <tr key={c.id}><td><strong>{c.code}</strong></td><td>{c.discount_type === "percentage" ? `${c.discount_value}%` : money(c.discount_value)}</td><td>{money(c.min_order_value)}</td><td>{dateText(c.expires_at)}</td><td>{c.is_active ? "Active" : "Disabled"}</td><td><div className="inline-actions"><button className="secondary" onClick={() => editCoupon(c)}>Edit</button><button className="secondary" onClick={() => toggleCoupon(c)}>{c.is_active ? "Disable" : "Enable"}</button><button className="danger" onClick={() => deleteCoupon(c.id)}>Delete</button></div></td></tr>)}</tbody></table></div></div>
    </>}
  </section>;
}
