"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase";

type Order = {
  id: string;
  created_at?: string;
  fulfillment_status?: string;
  payment_status?: string;
  order_number?: string;
  total?: number;
  customer_name?: string;
};

export default function AdminPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [email, setEmail] = useState("Admin");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const loadOrders = useCallback(async () => {
    const supabase = supabaseBrowser();
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;

    const session = data.session;
    if (!session?.access_token) {
      router.replace("/login?next=%2Fadmin");
      return;
    }

    const response = await fetch("/api/admin/orders", {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: "no-store",
    });
    const result = await response.json().catch(() => ({}));

    if (response.status === 401 || response.status === 403) {
      router.replace("/login?next=%2Fadmin");
      return;
    }
    if (!response.ok) throw new Error(result.error || "Could not load orders.");

    setOrders(Array.isArray(result.orders) ? result.orders : []);
    setEmail(session.user.email || "Admin");
  }, [router]);

  useEffect(() => {
    loadOrders()
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Unable to load admin dashboard."))
      .finally(() => setLoading(false));
  }, [loadOrders]);

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    setOrders([]);
    router.replace("/login?next=%2Fadmin");
  }

  const total = orders.length;
  const pending = orders.filter((order) => ["pending_utr", "pending_verification"].includes(order.payment_status || "")).length;
  const paid = orders.filter((order) => order.payment_status === "accepted").length;
  const active = orders.filter((order) => ["confirmed", "packed", "shipped"].includes(order.fulfillment_status || "")).length;

  return (
    <main style={{ minHeight: "100vh", padding: 24, color: "#f3f4fa", background: "radial-gradient(ellipse at top right, #29204a, #080a12 55%)", fontFamily: "Arial, sans-serif" }}>
      <div style={{ maxWidth: 1050, margin: "auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, borderBottom: "1px solid #292b3b", paddingBottom: 20 }}>
          <div style={{ fontSize: 23, fontWeight: 800 }}>velfrok <small style={{ display: "block", color: "#9b91c8", fontSize: 9, letterSpacing: 3 }}>BETTER LIVING</small></div>
          <button onClick={signOut} style={secondaryStyle}>Sign out</button>
        </header>

        {loading ? <section style={panelStyle}><h1>Checking secure access</h1><p>Please wait while we verify your administrator account.</p></section> : message ? <section style={panelStyle}><h1>Unable to load dashboard</h1><p>{message}</p><button onClick={() => loadOrders().catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Could not reload the dashboard."))} style={buttonStyle}>Try again</button></section> : (
          <>
            <section style={{ marginTop: 35 }}>
              <p style={{ color: "#a5a6b8" }}>ADMIN WORKSPACE / OVERVIEW</p>
              <h1>Welcome back, {email}</h1>
              <p style={{ color: "#a5a6b8" }}>Your Velfrok store dashboard is ready.</p>
            </section>
            <section style={{ margin: "28px 0" }}>
              <h2>Store operations</h2>
              <div style={gridStyle}>
                <a href="/admin/products" style={moduleStyle}>Products <small>Manage listings and images →</small></a>
                <a href="/admin/inventory" style={moduleStyle}>Inventory <small>Monitor and adjust stock →</small></a>
                <a href="/admin/orders" style={moduleStyle}>Orders <small>Review and update orders →</small></a>
                <a href="/admin/payments" style={moduleStyle}>Payments <small>Review payment records →</small></a>
                <a href="/admin/customers" style={moduleStyle}>Customers <small>View registered accounts →</small></a>
                <a href="/admin/coupons" style={moduleStyle}>Coupons <small>Manage promotional codes →</small></a>
              </div>
            </section>
            <section style={gridStyle}>
              <div style={statStyle}><span>Total orders</span><strong>{total}</strong></div>
              <div style={statStyle}><span>Pending payments</span><strong>{pending}</strong></div>
              <div style={statStyle}><span>Paid orders</span><strong>{paid}</strong></div>
              <div style={statStyle}><span>Active orders</span><strong>{active}</strong></div>
            </section>
            <section style={{ ...panelStyle, marginTop: 24 }}>
              <h2>Recent orders</h2>
              {orders.length === 0 ? <p>No customer orders yet.</p> : orders.slice(0, 20).map((order) => (
                <div key={order.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "14px 0", borderBottom: "1px solid #292b3b", fontSize: 13 }}>
                  <strong>{order.order_number || `Order #${order.id.slice(0, 8).toUpperCase()}`}</strong>
                  <span style={{ color: "#999bb0" }}>{order.fulfillment_status || "Unknown"} / {order.payment_status || "Unknown"}</span>
                </div>
              ))}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

const panelStyle: React.CSSProperties = { maxWidth: 520, margin: "55px auto", padding: 28, border: "1px solid #343147", borderRadius: 16, background: "rgba(19,19,32,.96)" };
const gridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14, margin: "20px 0" };
const moduleStyle: React.CSSProperties = { display: "block", padding: 16, border: "1px solid #343147", borderRadius: 12, background: "#141522", color: "#f3f4fa", textDecoration: "none", fontWeight: 700 };
const statStyle: React.CSSProperties = { padding: 20, border: "1px solid #343147", borderRadius: 13, background: "#141522" };
const buttonStyle: React.CSSProperties = { padding: 12, border: 0, borderRadius: 8, background: "#8466df", color: "#fff", fontWeight: 700, cursor: "pointer" };
const secondaryStyle: React.CSSProperties = { padding: "11px 15px", border: "1px solid #48445e", borderRadius: 9, background: "transparent", color: "#ddd5ff", cursor: "pointer" };
