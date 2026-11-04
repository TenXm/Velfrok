"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase";

const paymentLabels = { pending_utr: "Payment pending", pending_verification: "UTR under review", accepted: "Payment confirmed", rejected: "Payment rejected", due_on_delivery: "Pay on delivery" };
const fulfillmentLabels = { pending: "Order received", confirmed: "Confirmed", packed: "Packed", ready_to_ship: "Ready to ship", shipped: "Shipped", delivered: "Delivered", cancelled: "Cancelled" };
const stages = ["confirmed", "packed", "ready_to_ship", "shipped", "delivered"];
const money = (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(n) || 0);
const date = (v) => v && !Number.isNaN(new Date(v).getTime()) ? new Date(v).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";
const panel = { background: "#fff", border: "1px solid #e8e9e2", borderRadius: 16, padding: 22, marginBottom: 16 };
const action = { display: "inline-block", background: "#073d31", color: "#fff", padding: "11px 17px", borderRadius: 9, fontWeight: 700, fontSize: 13 };
const muted = { color: "#718078", fontSize: 12 };

export default function MyOrdersPage() {
  const [token, setToken] = useState("");
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signedOut, setSignedOut] = useState(false);
  const [updated, setUpdated] = useState(null);

  const refresh = useCallback(async (accessToken, quiet = false) => {
    if (!accessToken) return;
    if (!quiet) setLoading(true);
    try {
      const response = await fetch("/api/orders", { cache: "no-store", headers: { Authorization: `Bearer ${accessToken}` } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "অর্ডার লোড করা যায়নি।");
      setOrders(Array.isArray(result.orders) ? result.orders : []);
      setError("");
      setUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "অর্ডার লোড করা যায়নি।");
    } finally { if (!quiet) setLoading(false); }
  }, []);

  useEffect(() => {
    let active = true;
    const supabase = supabaseBrowser();
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const accessToken = data.session?.access_token || "";
      setToken(accessToken); setSignedOut(!accessToken);
      if (accessToken) refresh(accessToken); else setLoading(false);
    }).catch(() => { if (active) { setSignedOut(true); setLoading(false); } });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      const accessToken = session?.access_token || "";
      setToken(accessToken); setSignedOut(!accessToken);
      if (accessToken) refresh(accessToken); else { setOrders([]); setLoading(false); }
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, [refresh]);

  useEffect(() => {
    if (!token) return;
    const timer = setInterval(() => refresh(token, true), 20000);
    return () => clearInterval(timer);
  }, [token, refresh]);

  return <main style={{ minHeight: "100vh", background: "#f7f6f0", padding: "32px 18px 60px", color: "#172d26" }}>
    <div style={{ maxWidth: 940, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 34 }}>
        <Link href="/" style={{ color: "#073d31", fontWeight: 800, letterSpacing: 2 }}>VELFROK</Link>
        <Link href="/" style={{ color: "#315b4a", fontSize: 13 }}>← Continue shopping</Link>
      </header>
      <p style={{ ...muted, letterSpacing: 2, fontWeight: 700 }}>YOUR ACCOUNT</p>
      <h1 style={{ fontFamily: "Georgia,serif", fontSize: 40, margin: "8px 0" }}>My Orders</h1>
      <p style={muted}>Track your purchases and check payment updates. This page refreshes automatically.</p>
      {signedOut && <section style={panel}><h2>Sign in to view your orders</h2><p style={muted}>Your order history is private to your account.</p><Link href="/login" style={action}>Sign in</Link></section>}
      {error && <p role="alert" style={{ color: "#a3332d", background: "#fff0ed", padding: 14, borderRadius: 9 }}>{error}</p>}
      {loading && <p style={muted}>Loading your orders…</p>}
      {!loading && !signedOut && !error && orders.length === 0 && <section style={panel}><h2>No orders yet</h2><p style={muted}>Your purchases will appear here after checkout.</p><Link href="/" style={action}>Explore the store</Link></section>}
      {!loading && orders.map((order) => {
        const status = order.fulfillment_status || "pending";
        const payment = order.payment_status || "pending_utr";
        const stage = stages.indexOf(status);
        const needsUtr = order.payment_method === "upi" && ["pending_utr", "rejected"].includes(payment);
        return <article key={order.id} style={panel}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 14, borderBottom: "1px solid #e8e9e2", paddingBottom: 15 }}>
            <div><small style={muted}>ORDER</small><h2 style={{ margin: "5px 0", fontSize: 19 }}>{order.order_number || order.id}</h2><small style={muted}>Placed {date(order.created_at)}</small></div>
            <div><small style={muted}>TOTAL</small><h2 style={{ margin: "5px 0", fontSize: 21 }}>{money(order.total_amount)}</h2></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14, padding: "16px 0" }}>
            <div><small style={muted}>PAYMENT</small><p style={{ fontWeight: 700, margin: "5px 0" }}>{paymentLabels[payment] || payment.replaceAll("_", " ")}</p><small style={muted}>{String(order.payment_method || "").toUpperCase()}</small></div>
            <div><small style={muted}>ORDER STATUS</small><p style={{ fontWeight: 700, margin: "5px 0" }}>{fulfillmentLabels[status] || status.replaceAll("_", " ")}</p><small style={muted}>Acceptance: {order.order_acceptance_status || "Awaiting update"}</small></div>
          </div>
          {order.payment_method === "cod" && payment === "due_on_delivery" && <p style={{ background: "#f2f5ed", padding: 12, borderRadius: 8, fontSize: 13 }}>Please pay the delivery partner when your order arrives.</p>}
          {order.payment_method === "upi" && payment === "pending_verification" && <p style={{ background: "#f2f5ed", padding: 12, borderRadius: 8, fontSize: 13 }}>Your UTR has been received and is awaiting verification.</p>}
          {needsUtr && <p style={{ background: "#fff7e8", padding: 12, borderRadius: 8, fontSize: 13 }}>UPI payment is not confirmed. You can complete payment or submit your UTR.</p>}
          {status !== "cancelled" && <div style={{ padding: "8px 0 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 4, fontSize: 10, marginBottom: 8, color: "#718078" }}>{["Confirmed", "Packed", "Ready", "Shipped", "Delivered"].map((s, i) => <span key={s} style={{ color: stage >= i ? "#0c5141" : "#9ba49d", fontWeight: stage === i ? 800 : 500 }}>{s}</span>)}</div>
            <div style={{ height: 7, background: "#e8e9e2", borderRadius: 8, overflow: "hidden" }}><div style={{ height: "100%", width: `${stage < 0 ? 0 : (stage + 1) * 20}%`, background: "#0c6b50" }} /></div>
            {status === "pending" && <small style={muted}>Your order is awaiting confirmation.</small>}
          </div>}
          <div style={{ borderTop: "1px solid #e8e9e2", paddingTop: 14, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
            <small style={muted}>Status refreshes every 20 seconds.</small>
            {needsUtr && <Link href={`/payment/${encodeURIComponent(order.id)}`} style={action}>Pay / Submit UTR →</Link>}
          </div>
        </article>;
      })}
      {updated && !loading && <p style={{ ...muted, textAlign: "right" }}>Last updated {updated.toLocaleTimeString("en-IN")}</p>}
    </div>
  </main>;
}
