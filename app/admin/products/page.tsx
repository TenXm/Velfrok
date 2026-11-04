"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase";

type ProductRow = {
  id: string;
  name: string;
  sku: string;
  category_id: string | null;
  categories?: { name?: string } | null;
  description: string;
  image_urls: string[];
  colors: string[];
  dimensions: string | null;
  weight: string | null;
  mrp: number;
  selling_price: number;
  discount_pct: number;
  quantity: number;
  is_active: boolean;
};

type ProductForm = {
  id: string;
  name: string;
  sku: string;
  categoryName: string;
  description: string;
  imageUrls: string;
  colors: string;
  dimensions: string;
  weight: string;
  mrp: string;
  sellingPrice: string;
  quantity: string;
  isActive: boolean;
};

const emptyForm: ProductForm = {
  id: "", name: "", sku: "", categoryName: "", description: "",
  imageUrls: "", colors: "", dimensions: "", weight: "",
  mrp: "", sellingPrice: "", quantity: "0", isActive: true,
};

const money = (value: number) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 0,
}).format(value);

export default function AdminProductsPage() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const discount = useMemo(() => {
    const mrp = Number(form.mrp);
    const selling = Number(form.sellingPrice);
    if (!mrp || !selling || selling > mrp || mrp < 0) return 0;
    return Math.round(((mrp - selling) / mrp) * 100);
  }, [form.mrp, form.sellingPrice]);

  const request = useCallback(async (path: string, init: RequestInit = {}) => {
    const { data, error: sessionError } = await supabaseBrowser().auth.getSession();
    if (sessionError) throw sessionError;
    const token = data.session?.access_token;
    if (!token) throw new Error("Please sign in again to use the admin panel.");

    const response = await fetch(path, {
      ...init,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init.headers || {}),
      },
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Admin request failed.");
    return result;
  }, []);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await request("/api/admin/products");
      setProducts(Array.isArray(result.products) ? result.products : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load products.");
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  function editProduct(product: ProductRow) {
    setForm({
      id: product.id,
      name: product.name || "",
      sku: product.sku || "",
      categoryName: product.categories?.name || "",
      description: product.description || "",
      imageUrls: (product.image_urls || []).join("\n"),
      colors: (product.colors || []).join(", "),
      dimensions: product.dimensions || "",
      weight: product.weight || "",
      mrp: String(product.mrp ?? ""),
      sellingPrice: String(product.selling_price ?? ""),
      quantity: String(product.quantity ?? 0),
      isActive: product.is_active === true,
    });
    setMessage("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    const payload = {
      ...(form.id ? { id: form.id } : {}),
      name: form.name.trim(),
      sku: form.sku.trim(),
      categoryName: form.categoryName.trim(),
      description: form.description,
      imageUrls: form.imageUrls.split("\n").map((url) => url.trim()).filter(Boolean),
      colors: form.colors.split(",").map((color) => color.trim()).filter(Boolean),
      dimensions: form.dimensions.trim() || null,
      weight: form.weight.trim() || null,
      mrp: Number(form.mrp),
      sellingPrice: Number(form.sellingPrice),
      quantity: Number(form.quantity),
      isActive: form.isActive,
    };

    try {
      await request("/api/admin/products", {
        method: form.id ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      setForm(emptyForm);
      setMessage(form.id ? "Product updated." : "Product created.");
      await loadProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save product.");
    } finally {
      setSaving(false);
    }
  }

  async function archiveProduct(id: string) {
    if (!window.confirm("Archive this product? It will no longer appear in the shop.")) return;
    setError("");
    setMessage("");
    try {
      await request("/api/admin/products", {
        method: "DELETE",
        body: JSON.stringify({ id }),
      });
      setMessage("Product archived.");
      await loadProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not archive product.");
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f5f7fb", color: "#172033", padding: 20 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
          <div>
            <Link href="/admin" style={{ color: "#4b5d78", fontSize: 13 }}>← Admin dashboard</Link>
            <h1 style={{ margin: "10px 0 4px" }}>Product Management</h1>
            <p style={{ margin: 0, color: "#68738a" }}>Create, edit, and archive products in the live catalog.</p>
          </div>
          <button type="button" onClick={loadProducts} disabled={loading} style={buttonStyle}>Refresh products</button>
        </header>

        <form onSubmit={saveProduct} style={panelStyle}>
          <h2 style={{ marginTop: 0 }}>{form.id ? "Edit product" : "Add a product"}</h2>
          <div style={gridStyle}>
            <Field label="Product name"><input required maxLength={160} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} /></Field>
            <Field label="SKU"><input required maxLength={40} value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} style={inputStyle} /></Field>
            <Field label="Category (type a new name to create it)"><input required maxLength={80} value={form.categoryName} onChange={(e) => setForm({ ...form, categoryName: e.target.value })} style={inputStyle} /></Field>
            <Field label="Quantity in stock"><input required type="number" min="0" step="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} style={inputStyle} /></Field>
            <Field label="MRP (₹)"><input required type="number" min="0.01" step="0.01" value={form.mrp} onChange={(e) => setForm({ ...form, mrp: e.target.value })} style={inputStyle} /></Field>
            <Field label="Selling price (₹)"><input required type="number" min="0.01" step="0.01" value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })} style={inputStyle} /></Field>
            <Field label="Colours (comma separated)"><input value={form.colors} onChange={(e) => setForm({ ...form, colors: e.target.value })} style={inputStyle} /></Field>
            <Field label="Dimensions"><input value={form.dimensions} onChange={(e) => setForm({ ...form, dimensions: e.target.value })} placeholder="Length × Width × Height" style={inputStyle} /></Field>
            <Field label="Weight"><input value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} placeholder="e.g. 500 g" style={inputStyle} /></Field>
            <div style={{ alignSelf: "end", padding: "10px 0", fontWeight: 700 }}>Discount preview: {discount}%</div>
          </div>
          <Field label="Image URLs (one per line; upload integration is a separate step)">
            <textarea value={form.imageUrls} onChange={(e) => setForm({ ...form, imageUrls: e.target.value })} rows={3} style={inputStyle} />
          </Field>
          <Field label="Product description">
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={5} style={inputStyle} />
          </Field>
          <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "12px 0" }}>
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Active in storefront
          </label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button disabled={saving} type="submit" style={buttonStyle}>{saving ? "Saving..." : form.id ? "Save changes" : "Create product"}</button>
            {form.id && <button type="button" onClick={() => setForm(emptyForm)} style={secondaryStyle}>Cancel edit</button>}
          </div>
          {message && <p role="status" style={{ color: "#17623b" }}>{message}</p>}
          {error && <p role="alert" style={{ color: "#a11" }}>{error}</p>}
        </form>

        <section style={panelStyle}>
          <h2 style={{ marginTop: 0 }}>Existing products ({products.length})</h2>
          {loading ? <p>Loading products…</p> : products.length === 0 ? <p>No products found.</p> : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760, textAlign: "left" }}>
                <thead><tr>{["SKU", "Product", "Price", "Stock", "Status", "Actions"].map((label) => <th key={label} style={thStyle}>{label}</th>)}</tr></thead>
                <tbody>{products.map((product) => (
                  <tr key={product.id} style={{ borderTop: "1px solid #e3e8f0" }}>
                    <td style={tdStyle}>{product.sku}</td>
                    <td style={tdStyle}>{product.name}</td>
                    <td style={tdStyle}>{money(Number(product.selling_price))}</td>
                    <td style={tdStyle}>{product.quantity}</td>
                    <td style={tdStyle}>{product.is_active ? "Active" : "Archived"}</td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button type="button" onClick={() => editProduct(product)} style={secondaryStyle}>Edit</button>
                        {product.is_active && <button type="button" onClick={() => archiveProduct(product.id)} style={dangerStyle}>Archive</button>}
                      </div>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: "block", marginBottom: 14, fontSize: 13, fontWeight: 700 }}>{label}<div style={{ marginTop: 7 }}>{children}</div></label>;
}

const panelStyle: React.CSSProperties = { background: "#fff", border: "1px solid #e3e8f0", borderRadius: 14, padding: 20, marginBottom: 20 };
const gridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 };
const inputStyle: React.CSSProperties = { width: "100%", padding: 11, border: "1px solid #cbd5e1", borderRadius: 8, font: "inherit", boxSizing: "border-box" };
const buttonStyle: React.CSSProperties = { padding: "11px 16px", border: 0, borderRadius: 8, background: "#172033", color: "#fff", fontWeight: 700, cursor: "pointer" };
const secondaryStyle: React.CSSProperties = { padding: "8px 11px", border: "1px solid #cbd5e1", borderRadius: 7, background: "#fff", color: "#172033", fontWeight: 600, cursor: "pointer" };
const dangerStyle: React.CSSProperties = { ...secondaryStyle, color: "#a11", borderColor: "#e3b8b8" };
const thStyle: React.CSSProperties = { padding: 12, background: "#172033", color: "#fff", whiteSpace: "nowrap" };
const tdStyle: React.CSSProperties = { padding: 12, fontSize: 13 };
