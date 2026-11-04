"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase";

type Item = { id: string; sku: string; name: string; quantity: number; is_active: boolean; categories?: { name?: string } | null };

export default function AdminInventoryPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [operation, setOperation] = useState<"add" | "deduct" | "set">("add");
  const [quantity, setQuantity] = useState("1");
  const [filter, setFilter] = useState<"all" | "low" | "out">("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const request = useCallback(async (method = "GET", body?: unknown) => {
    const { data, error: sessionError } = await supabaseBrowser().auth.getSession();
    if (sessionError) throw sessionError;
    const token = data.session?.access_token;
    if (!token) throw new Error("Please sign in again to use the admin panel.");
    const response = await fetch("/api/admin/inventory", {
      method, cache: "no-store",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Inventory request failed.");
    return result;
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const result = await request();
      setItems(Array.isArray(result.products) ? result.products : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load inventory.");
    } finally { setLoading(false); }
  }, [request]);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => items.filter((item) => {
    if (filter === "low") return item.quantity > 0 && item.quantity < 10;
    if (filter === "out") return item.quantity === 0;
    return true;
  }), [items, filter]);

  function toggle(id: string, checked: boolean) {
    setSelected((current) => checked ? [...current, id] : current.filter((x) => x !== id));
  }

  async function apply() {
    const amount = Number(quantity);
    if (!selected.length) { setError("Select at least one product."); return; }
    if (!Number.isInteger(amount) || amount < 0) { setError("Enter a valid non-negative whole number."); return; }
    setSaving(true); setError(""); setMessage("");
    try {
      await request("PATCH", {
        changes: selected.map((product_id) => ({ product_id, operation, quantity: amount })),
      });
      setSelected([]);
      setMessage(`Inventory updated for ${selected.length} product(s).`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update inventory.");
    } finally { setSaving(false); }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f5f7fb", padding: 20, color: "#172033" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <Link href="/admin" style={{ color: "#4b5d78", fontSize: 13 }}>← Admin dashboard</Link>
        <header style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", margin: "12px 0 24px" }}>
          <div><h1 style={{ margin: "0 0 5px" }}>Inventory Management</h1><p style={{ margin: 0, color: "#68738a" }}>Review stock and make single or bulk adjustments.</p></div>
          <button onClick={load} disabled={loading} style={buttonStyle}>Refresh</button>
        </header>

        <section style={panelStyle}>
          <h2 style={{ marginTop: 0 }}>Bulk stock adjustment</h2>
          <p style={{ color: "#68738a", fontSize: 13 }}>Select products below, then add stock, deduct stock, or set an exact quantity. The database applies the batch atomically.</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <select value={operation} onChange={(e) => setOperation(e.target.value as typeof operation)} style={inputStyle}>
              <option value="add">+ Add stock</option><option value="deduct">− Deduct stock</option><option value="set">= Set exact stock</option>
            </select>
            <input type="number" min="0" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} style={{ ...inputStyle, width: 120 }} aria-label="Quantity" />
            <button onClick={apply} disabled={saving || loading || !selected.length} style={buttonStyle}>{saving ? "Applying..." : `Apply to ${selected.length} selected`}</button>
          </div>
          {message && <p role="status" style={{ color: "#17623b" }}>{message}</p>}
          {error && <p role="alert" style={{ color: "#a11" }}>{error}</p>}
        </section>

        <section style={panelStyle}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
            <h2 style={{ margin: 0, flex: 1 }}>Stock list</h2>
            <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} style={inputStyle}>
              <option value="all">All products</option><option value="low">Low stock (&lt;10)</option><option value="out">Out of stock (0)</option>
            </select>
            <button style={secondaryStyle} onClick={() => setSelected(visible.map((x) => x.id))}>Select visible</button>
            <button style={secondaryStyle} onClick={() => setSelected([])}>Clear selection</button>
          </div>
          {loading ? <p>Loading inventory…</p> : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", minWidth: 700, borderCollapse: "collapse", textAlign: "left" }}>
                <thead><tr>{["Select", "SKU", "Product", "Category", "Quantity", "Status"].map((x) => <th key={x} style={thStyle}>{x}</th>)}</tr></thead>
                <tbody>{visible.map((item) => (
                  <tr key={item.id} style={{ borderTop: "1px solid #e3e8f0" }}>
                    <td style={tdStyle}><input type="checkbox" checked={selected.includes(item.id)} onChange={(e) => toggle(item.id, e.target.checked)} /></td>
                    <td style={tdStyle}>{item.sku}</td><td style={tdStyle}>{item.name}</td><td style={tdStyle}>{item.categories?.name || "—"}</td>
                    <td style={tdStyle}><strong>{item.quantity}</strong></td>
                    <td style={tdStyle}>{item.quantity === 0 ? "Out of stock" : item.quantity < 10 ? "Low stock" : item.is_active ? "In stock" : "Inactive"}</td>
                  </tr>
                ))}</tbody>
              </table>
              {visible.length === 0 && <p>No products match this filter.</p>}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

const panelStyle: React.CSSProperties = { background: "#fff", border: "1px solid #e3e8f0", borderRadius: 14, padding: 20, margin: "20px 0" };
const inputStyle: React.CSSProperties = { padding: 10, border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff" };
const buttonStyle: React.CSSProperties = { padding: "11px 16px", border: 0, borderRadius: 8, background: "#172033", color: "#fff", fontWeight: 700, cursor: "pointer" };
const secondaryStyle: React.CSSProperties = { padding: "9px 12px", border: "1px solid #cbd5e1", borderRadius: 7, background: "#fff", cursor: "pointer" };
const thStyle: React.CSSProperties = { padding: 12, background: "#172033", color: "#fff" };
const tdStyle: React.CSSProperties = { padding: 12, fontSize: 13 };
