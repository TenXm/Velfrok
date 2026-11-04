"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase";

type Order = {
  id: string; order_number: string; customer_name: string; email: string;
  total: number; payment_status: string; utr_number: string | null; created_at: string;
};

export default function AdminPaymentsPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const { data, error: sessionError } = await supabaseBrowser().auth.getSession();
      if (sessionError) throw sessionError;
      const token = data.session?.access_token;
      if (!token) throw new Error("Please sign in again to use the admin panel.");
      const response = await fetch("/api/admin/orders", {
        cache: "no-store", headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not load payment records.");
      setOrders(Array.isArray(result.orders) ? result.orders : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load payment records.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const count = orders.filter((order) => order.payment_status).length;

  return (
    <main style={{ minHeight: "100vh", background: "#f5f7fb", padding: 20, color: "#172033" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <Link href="/admin" style={{ color: "#4b5d78", fontSize: 13 }}>← Admin dashboard</Link>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", margin: "12px 0 24px" }}>
          <div><h1 style={{ margin: "0 0 5px" }}>Payments</h1><p style={{ margin: 0, color: "#68738a" }}>Payment records linked to customer orders. This view is read-only.</p></div>
          <button onClick={load} disabled={loading} style={buttonStyle}>Refresh</button>
        </header>
        <section style={panelStyle}>
          <p style={{ color: "#68738a", margin: "0 0 5px" }}>Orders with payment status</p>
          <strong style={{ fontSize: 30 }}>{loading ? "…" : count}</strong>
          {loading ? <p>Loading payment information…</p> : error ? <p role="alert" style={{ color: "#a11" }}>{error}</p> : (
            <div style={{ overflowX: "auto", marginTop: 18 }}>
              <table style={{ width: "100%", minWidth: 800, borderCollapse: "collapse", textAlign: "left" }}>
                <thead><tr>{["Order", "Customer", "Total", "Payment status", "UTR", "Created"].map((x) => <th key={x} style={thStyle}>{x}</th>)}</tr></thead>
                <tbody>{orders.map((order) => <tr key={order.id} style={{ borderTop: "1px solid #e3e8f0" }}>
                  <td style={tdStyle}>{order.order_number || order.id.slice(0, 8)}</td>
                  <td style={tdStyle}>{order.customer_name || order.email || "—"}</td>
                  <td style={tdStyle}>₹{Number(order.total || 0).toLocaleString("en-IN")}</td>
                  <td style={tdStyle}>{order.payment_status || "—"}</td>
                  <td style={tdStyle}>{order.utr_number || "Pending UTR"}</td>
                  <td style={tdStyle}>{order.created_at ? new Date(order.created_at).toLocaleString() : "—"}</td>
                </tr>)}</tbody>
              </table>
              {orders.length === 0 && <p>No orders or payment information found.</p>}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
const panelStyle: React.CSSProperties = { background: "#fff", border: "1px solid #e3e8f0", borderRadius: 14, padding: 20 };
const buttonStyle: React.CSSProperties = { padding: "11px 16px", border: 0, borderRadius: 8, background: "#172033", color: "#fff", fontWeight: 700, cursor: "pointer" };
const thStyle: React.CSSProperties = { padding: 12, background: "#172033", color: "#fff", whiteSpace: "nowrap" };
const tdStyle: React.CSSProperties = { padding: 12, fontSize: 13 };
