"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type AnyRow = Record<string, any>;
type Props = { accessToken: string; initialOrders?: AnyRow[] };
type Option = { id: string; attribute_name: string; attribute_slug: string; value: string; normalized_value: string };

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
  const [products, setProducts] = useState<AnyRow[]>([]);
  const [categories, setCategories] = useState<AnyRow[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [coupons, setCoupons] = useState<AnyRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [stockFilter, setStockFilter] = useState("all");
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [stockMode, setStockMode] = useState("add");
  const [stockAmount, setStockAmount] = useState("1");
  const [orderEdits, setOrderEdits] = useState<Record<string, { payment: string; fulfillment: string }>>({});
  const [categoryName, setCategoryName] = useState("");
  const [categoryManagerSelection, setCategoryManagerSelection] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [productForm, setProductForm] = useState({
    name: "", sku: "", category_id: "", description: "", mrp: "", selling_price: "", quantity: "0",
    colours: [] as string[], imagesText: "", dimensions: "", weight: "", attributes: {} as Record<string, string[]>, is_active: true,
  });
  const [newAttributeName, setNewAttributeName] = useState("");
  const [customAttributeNames, setCustomAttributeNames] = useState<string[]>([]);
  const [couponForm, setCouponForm] = useState({ code: "", discount_type: "percentage", discount_value: "", min_order_value: "0", max_discount: "", expires_at: "", usage_limit: "", per_customer_limit: "" });

  const api = useCallback(async (path: string, init: RequestInit = {}) => {
    const response = await fetch(path, {
      ...init,
      headers: { Authorization: `Bearer ${accessToken}`, ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...(init.headers || {}) },
      cache: "no-store",
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Request failed.");
    return result;
  }, [accessToken]);

  const loadAll = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const [catalog, couponData, orderData] = await Promise.all([
        api("/api/admin/catalog"), api("/api/admin/coupons"), api("/api/admin/orders"),
      ]);
      setProducts(catalog.products || []);
      setCategories(catalog.categories || []);
      setOptions(catalog.options || []);
      setCoupons(couponData.coupons || []);
      setOrders(orderData.orders || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load admin data.");
    } finally { setBusy(false); }
  }, [api]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const addOption = async (attributeName: string, value: string) => {
    try {
      const result = await api("/api/admin/catalog", { method: "POST", body: JSON.stringify({ action: "option", attributeName, value }) });
      setOptions(old => [...old, result.option]);
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
    setProductForm({ name: "", sku: "", category_id: "", description: "", mrp: "", selling_price: "", quantity: "0", colours: [], imagesText: "", dimensions: "", weight: "", attributes: {}, is_active: true });
    setNewAttributeName("");
    setCustomAttributeNames([]);
  };

  const startEditProduct = (product: AnyRow) => {
    setEditingId(product.id);
    setProductForm({
      name: product.name || "", sku: product.sku || "", category_id: product.category_id || "", description: product.description || "",
      mrp: String(product.mrp ?? ""), selling_price: String(product.selling_price ?? ""), quantity: String(product.quantity ?? 0),
      colours: Array.isArray(product.colours) ? product.colours : [], imagesText: Array.isArray(product.images) ? product.images.join("\n") : "",
      dimensions: product.dimensions || "", weight: product.weight || "", attributes: product.attributes && typeof product.attributes === "object" ? product.attributes : {}, is_active: product.is_active !== false,
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
      setProductForm(f => ({ ...f, imagesText: [f.imagesText, ...(result.images || [])].filter(Boolean).join("\\n") }));
      setMessage(`${(result.images || []).length} product image(s) uploaded.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Image upload failed."); }
    finally { setBusy(false); }
  };

  const saveProduct = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const payload = {
      name: productForm.name, sku: productForm.sku, category_id: productForm.category_id || null,
      description: productForm.description, mrp: Number(productForm.mrp), selling_price: Number(productForm.selling_price),
      quantity: Number(productForm.quantity), colours: productForm.colours,
      images: productForm.imagesText.split("\n").map(v => v.trim()).filter(Boolean),
      dimensions: productForm.dimensions, weight: productForm.weight, attributes: productForm.attributes, is_active: productForm.is_active,
    };
    try {
      const result = await api("/api/admin/catalog", { method: editingId ? "PATCH" : "POST", body: JSON.stringify(editingId ? { action: "product", id: editingId, product: payload } : { action: "product", product: payload }) });
      setProducts(old => editingId ? old.map(p => p.id === editingId ? result.product : p) : [result.product, ...old]);
      resetProductForm(); setMessage(editingId ? "Product updated." : "Product added.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save product."); }
    finally { setBusy(false); }
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
      const quantities = new Map((result.results || []).map((item: AnyRow) => [item.product_id, item.quantity]));
      setProducts(old => old.map(p => quantities.has(p.id) ? { ...p, quantity: quantities.get(p.id) } : p));
      setSelectedProducts([]); setMessage("Inventory updated for selected products.");
    } catch (e) { setError(e instanceof Error ? e.message : "Inventory update failed."); }
    finally { setBusy(false); }
  };

  const updateOrder = async (order: AnyRow, field: "payment" | "fulfillment") => {
    const edit = orderEdits[order.id] || { payment: order.payment_status || "pending_utr", fulfillment: order.fulfillment_status || "confirmed" };
    const body = field === "payment" ? { orderId: order.id, paymentStatus: edit.payment } : { orderId: order.id, fulfillmentStatus: edit.fulfillment };
    setBusy(true); setError(""); setMessage("");
    try {
      await api("/api/admin/orders", { method: "PATCH", body: JSON.stringify(body) });
      setMessage("Order updated successfully.");
      await loadAll();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update order."); }
    finally { setBusy(false); }
  };

  const saveCoupon = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const result = await api("/api/admin/coupons", { method: "POST", body: JSON.stringify({
        ...couponForm, discount_value: Number(couponForm.discount_value), min_order_value: Number(couponForm.min_order_value),
        max_discount: couponForm.max_discount || null, usage_limit: couponForm.usage_limit || null,
        per_customer_limit: couponForm.per_customer_limit || null, expires_at: couponForm.expires_at || null,
      }) });
      setCoupons(old => [result.coupon, ...old]);
      setCouponForm({ code: "", discount_type: "percentage", discount_value: "", min_order_value: "0", max_discount: "", expires_at: "", usage_limit: "", per_customer_limit: "" });
      setMessage("Coupon created.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create coupon."); }
    finally { setBusy(false); }
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
  const filteredOrders = orders.filter(o => [o.order_number, o.customer_name, o.mobile].some(v => String(v || "").toLowerCase().includes(orderSearch.toLowerCase())));
  const pendingPayments = orders.filter(o => ["pending_utr", "pending_verification"].includes(o.payment_status)).length;
  const revenue = orders.filter(o => o.payment_status === "accepted").reduce((sum,o) => sum + Number(o.total_amount || 0), 0);
  const lowStock = products.filter(p => Number(p.quantity) < 10).length;
  const discountPct = Number(productForm.mrp) > 0 && Number(productForm.selling_price) >= 0 ? Math.max(0, Math.round(((Number(productForm.mrp) - Number(productForm.selling_price)) / Number(productForm.mrp)) * 100)) : 0;
  const attributeNames = Array.from(new Set(["Size", "Material", "Brand", "Pattern", "GST Rate", ...options.map(o => o.attribute_name), ...customAttributeNames]));

  const styles = `
    .admin-workspace{color:#f3f4fa}.admin-tabs{display:flex;gap:8px;overflow:auto;padding:18px 0}.admin-tabs button{white-space:nowrap;border:1px solid #343147;border-radius:9px;background:#141522;color:#c9c6d8;padding:10px 14px;cursor:pointer}.admin-tabs button.active{background:#8466df;border-color:#8466df;color:#fff}.admin-card{background:#141522;border:1px solid #343147;border-radius:14px;padding:18px;margin:14px 0}.admin-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.admin-stat{background:#141522;border:1px solid #343147;border-radius:12px;padding:16px}.admin-stat span{font-size:12px;color:#a5a6b8}.admin-stat strong{display:block;font-size:25px;margin-top:8px}.admin-workspace h2{font-size:19px;margin:0 0 14px}.admin-workspace h3{font-size:15px;margin:16px 0 8px}.admin-workspace p,.admin-workspace small{color:#a5a6b8}.admin-workspace small{display:block;font-size:11px;margin-top:5px}.admin-workspace label{display:block;font-size:12px;color:#c9c6d8;margin:0 0 6px}.admin-workspace input,.admin-workspace select,.admin-workspace textarea{width:100%;padding:11px 12px;border:1px solid #45415b;border-radius:8px;background:#10111e;color:#f3f4fa;outline:none}.admin-workspace textarea{min-height:85px;resize:vertical}.admin-workspace button.primary{border:0;border-radius:8px;background:#8466df;color:#fff;padding:11px 15px;font-weight:700;cursor:pointer}.admin-workspace button.secondary{border:1px solid #48445e;border-radius:8px;background:transparent;color:#ddd5ff;padding:10px 13px;cursor:pointer}.admin-workspace button.danger{border:1px solid #75414b;border-radius:8px;background:#351b25;color:#ffc4cb;padding:8px 10px;cursor:pointer}.admin-workspace button:disabled{opacity:.5;cursor:wait}.admin-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.field{position:relative;min-width:0}.picker{position:relative}.picker-menu{position:absolute;z-index:20;top:calc(100% + 4px);left:0;right:0;max-height:240px;overflow:auto;background:#202033;border:1px solid #514b70;border-radius:9px;padding:6px;box-shadow:0 12px 28px #0008}.picker-menu button{display:block;width:100%;text-align:left;background:transparent;color:#f3f4fa;border:0;border-radius:6px;padding:9px;cursor:pointer}.picker-menu button:hover{background:#35304b}.picker-menu .add-option{color:#c7b9ff;border-top:1px solid #46415c;margin-top:4px}.picker-menu .close-menu{color:#a5a6b8;font-size:11px}.empty-match{padding:5px 8px;font-size:12px}.chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}.chip{display:inline-flex;align-items:center;gap:6px;border:1px solid #50496c;background:#252039;border-radius:20px;padding:4px 9px;font-size:12px}.chip button{background:transparent;border:0;color:#fff;cursor:pointer;font-size:16px}.admin-table-wrap{overflow:auto}.admin-table{width:100%;border-collapse:collapse;min-width:760px;font-size:12px}.admin-table th,.admin-table td{text-align:left;padding:11px 9px;border-bottom:1px solid #292b3b;vertical-align:middle}.admin-table th{color:#aaa4c5;font-weight:600}.admin-table select{min-width:145px;padding:8px}.inline-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.notice{padding:11px 13px;border-radius:9px;margin:12px 0;background:#28233b;color:#d7caff;font-size:13px}.notice.error{background:#351b25;color:#ffc4cb}.form-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:14px}.section-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.product-form{display:grid;gap:13px}.product-row{display:flex;gap:8px;align-items:center}.product-row>*{flex:1}.muted-text{color:#999bb0;font-size:11px}@media(max-width:760px){.admin-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.admin-fields{grid-template-columns:1fr}.admin-card{padding:13px}.admin-stat strong{font-size:21px}}
  `;

  return <section className="admin-workspace">
    <style>{styles}</style>
    <nav className="admin-tabs">
      {[["overview","Overview"],["orders","Orders"],["products","Products"],["inventory","Inventory"],["coupons","Coupons"]].map(([id,label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>)}
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
      {filteredOrders.length === 0 ? <p>No matching orders.</p> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Order / Customer</th><th>Items</th><th>Payment / UTR</th><th>Fulfilment</th><th>Amount</th><th>Update</th></tr></thead><tbody>{filteredOrders.map(o => {
        const edit = orderEdits[o.id] || { payment: o.payment_status || "pending_utr", fulfillment: o.fulfillment_status || "confirmed" };
        const next = ({ confirmed: "packed", packed: "shipped", shipped: "delivered" } as Record<string,string>)[o.fulfillment_status] || o.fulfillment_status;
        return <tr key={o.id}>
          <td><strong>{o.order_number || o.id.slice(0,8)}</strong><br/>{o.customer_name}<br/><span className="muted-text">{o.mobile} · {o.city} · {o.pin_code || o.pincode}</span></td>
          <td>{(o.order_items || []).map((it: AnyRow) => <div key={it.id}>{it.product_name} × {it.quantity}<br/><span className="muted-text">{it.sku}</span></div>)}</td>
          <td><strong>{o.payment_status}</strong><br/><span className="muted-text">UTR: {o.utr_number || "Not submitted"}</span><select value={edit.payment} onChange={e => setOrderEdits(old => ({...old,[o.id]:{...edit,payment:e.target.value}}))}><option value="accepted">Accept payment</option><option value="rejected">Reject payment</option><option value="pending_utr" disabled>Pending UTR (read only)</option><option value="pending_verification" disabled>Pending verification (read only)</option></select><button className="primary" style={{marginTop:6}} disabled={busy || !["accepted","rejected"].includes(edit.payment) || edit.payment === o.payment_status} onClick={() => updateOrder(o,"payment")}>Submit payment</button></td>
          <td><strong>{o.fulfillment_status}</strong><select value={edit.fulfillment} onChange={e => setOrderEdits(old => ({...old,[o.id]:{...edit,fulfillment:e.target.value}}))}><option value={o.fulfillment_status}>{o.fulfillment_status}</option>{next !== o.fulfillment_status && <option value={next}>{next}</option>}</select><button className="primary" style={{marginTop:6}} disabled={busy || edit.fulfillment === o.fulfillment_status || o.payment_status !== "accepted"} onClick={() => updateOrder(o,"fulfillment")}>Submit status</button></td>
          <td>{money(o.total_amount)}</td>
          <td>{dateText(o.created_at)}<br/><span className="muted-text">{o.address || o.street_address || ""}</span></td>
        </tr>;
      })}</tbody></table></div>}
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
            <div className="field"><label>Selling price (₹) *</label><input required type="number" min="0.01" step="0.01" value={productForm.selling_price} onChange={e => setProductForm(f => ({...f,selling_price:e.target.value}))}/><small>Automatic discount: {discountPct}%</small></div>
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
          <div className="field"><label>Product image URLs (one URL per line)</label><textarea value={productForm.imagesText} onChange={e => setProductForm(f => ({...f,imagesText:e.target.value}))} placeholder={"https://.../main-product.webp\nhttps://.../second-angle.webp"}/><small>Uploaded images are added here and saved to the existing images JSON field. You can also paste your own HTTPS image URLs.</small></div>
          <div className="form-actions"><button className="primary" disabled={busy}>{busy ? "Saving..." : editingId ? "Submit product changes" : "Submit new product"}</button><button type="button" className="secondary" onClick={resetProductForm}>Clear form</button></div>
        </form>
      </div>

      <div className="admin-card">
        <div className="section-head"><h2>Categories</h2><span className="muted-text">{categories.length} total</span></div>
        <CategoryPicker categories={categories} value={categoryManagerSelection} onChange={setCategoryManagerSelection} onCreate={createCategory}/>
        <div className="chips">{categories.map(c => <span className="chip" key={c.id}>{c.name}</span>)}</div>
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

    {tab === "coupons" && <>
      <div className="admin-card"><h2>Create coupon</h2><form onSubmit={saveCoupon} className="product-form">
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
        <button className="primary" disabled={busy}>Submit new coupon</button>
      </form></div>
      <div className="admin-card"><h2>Coupon codes</h2><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Code</th><th>Discount</th><th>Minimum order</th><th>Expiry</th><th>Status</th><th>Actions</th></tr></thead><tbody>{coupons.map(c => <tr key={c.id}><td><strong>{c.code}</strong></td><td>{c.discount_type === "percentage" ? `${c.discount_value}%` : money(c.discount_value)}</td><td>{money(c.min_order_value)}</td><td>{dateText(c.expires_at)}</td><td>{c.is_active ? "Active" : "Disabled"}</td><td><div className="inline-actions"><button className="secondary" onClick={() => toggleCoupon(c)}>{c.is_active ? "Disable" : "Enable"}</button><button className="danger" onClick={() => deleteCoupon(c.id)}>Delete</button></div></td></tr>)}</tbody></table></div></div>
    </>}
  </section>;
}
