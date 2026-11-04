"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase";

type Coupon = {
  id: string; code: string; discount_type: "percentage" | "flat";
  discount_value: number; min_order_value: number; max_discount: number | null;
  expires_at: string | null; usage_limit: number | null;
  per_customer_limit: number | null; usage_count: number; is_active: boolean;
};
type Form = {
  id: string; code: string; discountType: "percentage" | "flat";
  discountValue: string; minOrderValue: string; maxDiscount: string;
  expiresAt: string; usageLimit: string; perCustomerLimit: string; isActive: boolean;
};
const empty: Form = { id: "", code: "", discountType: "percentage", discountValue: "10", minOrderValue: "0", maxDiscount: "", expiresAt: "", usageLimit: "", perCustomerLimit: "", isActive: true };

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [form, setForm] = useState<Form>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const request = useCallback(async (method = "GET", body?: unknown) => {
    const { data, error: sessionError } = await supabaseBrowser().auth.getSession();
    if (sessionError) throw sessionError;
    const token = data.session?.access_token;
    if (!token) throw new Error("Please sign in again to use the admin panel.");
    const response = await fetch("/api/admin/coupons", {
      method, cache: "no-store",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Coupon request failed.");
    return result;
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const result = await request();
      setCoupons(Array.isArray(result.coupons) ? result.coupons : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load coupons.");
    } finally { setLoading(false); }
  }, [request]);

  useEffect(() => { load(); }, [load]);

  function edit(item: Coupon) {
    setForm({
      id: item.id, code: item.code, discountType: item.discount_type,
      discountValue: String(item.discount_value), minOrderValue: String(item.min_order_value),
      maxDiscount: item.max_discount == null ? "" : String(item.max_discount),
      expiresAt: item.expires_at ? item.expires_at.slice(0, 16) : "",
      usageLimit: item.usage_limit == null ? "" : String(item.usage_limit),
      perCustomerLimit: item.per_customer_limit == null ? "" : String(item.per_customer_limit),
      isActive: item.is_active,
    });
    setMessage(""); setError("");
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setMessage("");
    const payload = {
      ...(form.id ? { id: form.id } : {}),
      code: form.code.trim().toUpperCase(),
      discountType: form.discountType,
      discountValue: Number(form.discountValue),
      minOrderValue: Number(form.minOrderValue),
      maxDiscount: form.maxDiscount ? Number(form.maxDiscount) : null,
      expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
      perCustomerLimit: form.perCustomerLimit ? Number(form.perCustomerLimit) : null,
      isActive: form.isActive,
    };
    try {
      await request(form.id ? "PATCH" : "POST", payload);
      setForm(empty); setMessage(form.id ? "Coupon updated." : "Coupon created.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save coupon.");
    } finally { setSaving(false); }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this coupon?")) return;
    setError(""); setMessage("");
    try { await request("DELETE", { id }); setMessage("Coupon deleted."); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not delete coupon."); }
  }

  async function toggle(item: Coupon) {
    try {
      await request("PATCH", {
        id: item.id, code: item.code, discountType: item.discount_type,
        discountValue: Number(item.discount_value), minOrderValue: Number(item.min_order_value),
        maxDiscount: item.max_discount == null ? null : Number(item.max_discount),
        expiresAt: item.expires_at, usageLimit: item.usage_limit,
        perCustomerLimit: item.per_customer_limit, isActive: !item.is_active,
      });
      setMessage(`Coupon ${item.code} ${item.is_active ? "disabled" : "activated"}.`);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not update coupon."); }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f5f7fb", color: "#172033", padding: 20 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <Link href="/admin" style={{ color: "#4b5d78", fontSize: 13 }}>← Admin dashboard</Link>
        <header style={{ margin: "12px 0 24px" }}><h1 style={{ margin: "0 0 5px" }}>Coupon Management</h1><p style={{ margin: 0, color: "#68738a" }}>Create, activate, disable, and remove promotional codes.</p></header>

        <form onSubmit={save} style={panelStyle}>
          <h2 style={{ marginTop: 0 }}>{form.id ? "Edit coupon" : "Create coupon"}</h2>
          <div style={gridStyle}>
            <Field label="Coupon code"><input required maxLength={32} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} style={inputStyle} /></Field>
            <Field label="Discount type"><select value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value as Form["discountType"] })} style={inputStyle}><option value="percentage">Percentage %</option><option value="flat">Flat ₹</option></select></Field>
            <Field label="Discount value"><input required type="number" min="0.01" step="0.01" value={form.discountValue} onChange={(e) => setForm({ ...form, discountValue: e.target.value })} style={inputStyle} /></Field>
            <Field label="Minimum order value (₹)"><input required type="number" min="0" step="0.01" value={form.minOrderValue} onChange={(e) => setForm({ ...form, minOrderValue: e.target.value })} style={inputStyle} /></Field>
            <Field label="Maximum discount cap (₹)"><input type="number" min="0.01" step="0.01" value={form.maxDiscount} onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })} style={inputStyle} /></Field>
            <Field label="Expiry date"><input type="datetime-local" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} style={inputStyle} /></Field>
            <Field label="Total usage limit"><input type="number" min="1" step="1" value={form.usageLimit} onChange={(e) => setForm({ ...form, usageLimit: e.target.value })} style={inputStyle} /></Field>
            <Field label="Per-customer limit"><input type="number" min="1" step="1" value={form.perCustomerLimit} onChange={(e) => setForm({ ...form, perCustomerLimit: e.target.value })} style={inputStyle} /></Field>
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "12px 0" }}><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Active</label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><button disabled={saving} style={buttonStyle}>{saving ? "Saving..." : form.id ? "Save changes" : "Create coupon"}</button>{form.id && <button type="button" onClick={() => setForm(empty)} style={secondaryStyle}>Cancel</button>}</div>
          {message && <p role="status" style={{ color: "#17623b" }}>{message}</p>}
          {error && <p role="alert" style={{ color: "#a11" }}>{error}</p>}
        </form>

        <section style={panelStyle}>
          <h2 style={{ marginTop: 0 }}>Existing coupons</h2>
          {loading ? <p>Loading coupons…</p> : coupons.length === 0 ? <p>No coupons created yet.</p> : (
            <div style={{ overflowX: "auto" }}><table style={{ width: "100%", minWidth: 850, borderCollapse: "collapse", textAlign: "left" }}>
              <thead><tr>{["Code", "Discount", "Minimum", "Usage", "Expires", "Status", "Actions"].map((x) => <th key={x} style={thStyle}>{x}</th>)}</tr></thead>
              <tbody>{coupons.map((item) => <tr key={item.id} style={{ borderTop: "1px solid #e3e8f0" }}>
                <td style={tdStyle}><strong>{item.code}</strong></td><td style={tdStyle}>{item.discount_type === "percentage" ? `${item.discount_value}%` : `₹${item.discount_value}`}</td>
                <td style={tdStyle}>₹{Number(item.min_order_value).toLocaleString("en-IN")}</td><td style={tdStyle}>{item.usage_count}{item.usage_limit ? ` / ${item.usage_limit}` : ""}</td>
                <td style={tdStyle}>{item.expires_at ? new Date(item.expires_at).toLocaleDateString() : "No expiry"}</td><td style={tdStyle}>{item.is_active ? "Active" : "Disabled"}</td>
                <td style={tdStyle}><div style={{ display: "flex", gap: 7 }}><button type="button" style={secondaryStyle} onClick={() => edit(item)}>Edit</button><button type="button" style={secondaryStyle} onClick={() => toggle(item)}>{item.is_active ? "Disable" : "Enable"}</button><button type="button" style={dangerStyle} onClick={() => remove(item.id)}>Delete</button></div></td>
              </tr>)}</tbody>
            </table></div>
          )}
        </section>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: "block", marginBottom: 14, fontSize: 13, fontWeight: 700 }}>{label}<div style={{ marginTop: 7 }}>{children}</div></label>;
}
const panelStyle: React.CSSProperties = { background: "#fff", border: "1px solid #e3e8f0", borderRadius: 14, padding: 20, margin: "20px 0" };
const gridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 };
const inputStyle: React.CSSProperties = { width: "100%", padding: 11, border: "1px solid #cbd5e1", borderRadius: 8, font: "inherit", boxSizing: "border-box" };
const buttonStyle: React.CSSProperties = { padding: "11px 16px", border: 0, borderRadius: 8, background: "#172033", color: "#fff", fontWeight: 700, cursor: "pointer" };
const secondaryStyle: React.CSSProperties = { padding: "8px 11px", border: "1px solid #cbd5e1", borderRadius: 7, background: "#fff", color: "#172033", cursor: "pointer" };
const dangerStyle: React.CSSProperties = { ...secondaryStyle, color: "#a11" };
const thStyle: React.CSSProperties = { padding: 12, background: "#172033", color: "#fff", whiteSpace: "nowrap" };
const tdStyle: React.CSSProperties = { padding: 12, fontSize: 13 };
