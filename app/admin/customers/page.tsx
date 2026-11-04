"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase";

type Customer = {
  id: string; email: string; phone: string; created_at: string;
  last_sign_in_at: string | null; email_confirmed_at: string | null;
  user_metadata: { full_name: string };
};

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(async (pageNumber = page) => {
    setLoading(true); setError("");
    try {
      const { data, error: sessionError } = await supabaseBrowser().auth.getSession();
      if (sessionError) throw sessionError;
      const token = data.session?.access_token;
      if (!token) throw new Error("Please sign in again to use the admin panel.");
      const response = await fetch(`/api/admin/customers?page=${pageNumber}`, {
        cache: "no-store", headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not load customers.");
      setCustomers(Array.isArray(result.customers) ? result.customers : []);
      setHasMore(Boolean(result.hasMore));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load customers.");
    } finally { setLoading(false); }
  }, [page]);

  useEffect(() => { load(page); }, [load, page]);

  return (
    <main style={{ minHeight: "100vh", background: "#f5f7fb", padding: 20, color: "#172033" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <Link href="/admin" style={{ color: "#4b5d78", fontSize: 13 }}>← Admin dashboard</Link>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", margin: "12px 0 24px" }}>
          <div><h1 style={{ margin: "0 0 5px" }}>Customers</h1><p style={{ margin: 0, color: "#68738a" }}>Read-only directory of registered customer accounts.</p></div>
          <button onClick={() => load(page)} disabled={loading} style={buttonStyle}>Refresh</button>
        </header>
        <section style={panelStyle}>
          <h2 style={{ marginTop: 0 }}>Customer accounts</h2>
          {loading ? <p>Loading customers…</p> : error ? <p role="alert" style={{ color: "#a11" }}>{error}</p> : customers.length === 0 ? <p>No customer accounts found.</p> : (
            <div style={{ overflowX: "auto" }}><table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse", textAlign: "left" }}>
              <thead><tr>{["Name", "Email", "Phone", "Joined", "Last sign-in", "Email status"].map((x) => <th key={x} style={thStyle}>{x}</th>)}</tr></thead>
              <tbody>{customers.map((customer) => <tr key={customer.id} style={{ borderTop: "1px solid #e3e8f0" }}>
                <td style={tdStyle}>{customer.user_metadata.full_name || "—"}</td>
                <td style={tdStyle}>{customer.email || "—"}</td><td style={tdStyle}>{customer.phone || "—"}</td>
                <td style={tdStyle}>{customer.created_at ? new Date(customer.created_at).toLocaleDateString() : "—"}</td>
                <td style={tdStyle}>{customer.last_sign_in_at ? new Date(customer.last_sign_in_at).toLocaleString() : "Never"}</td>
                <td style={tdStyle}>{customer.email_confirmed_at ? "Verified" : "Unverified"}</td>
              </tr>)}</tbody>
            </table></div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18 }}>
            <span style={{ color: "#68738a", fontSize: 13 }}>Page {page} · {customers.length} accounts</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={secondaryStyle} disabled={page <= 1 || loading} onClick={() => setPage((x) => Math.max(1, x - 1))}>Previous</button>
              <button style={secondaryStyle} disabled={!hasMore || loading} onClick={() => setPage((x) => x + 1)}>Next</button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
const panelStyle: React.CSSProperties = { background: "#fff", border: "1px solid #e3e8f0", borderRadius: 14, padding: 20 };
const buttonStyle: React.CSSProperties = { padding: "11px 16px", border: 0, borderRadius: 8, background: "#172033", color: "#fff", fontWeight: 700, cursor: "pointer" };
const secondaryStyle: React.CSSProperties = { padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 7, background: "#fff", cursor: "pointer" };
const thStyle: React.CSSProperties = { padding: 12, background: "#172033", color: "#fff", whiteSpace: "nowrap" };
const tdStyle: React.CSSProperties = { padding: 12, fontSize: 13 };
