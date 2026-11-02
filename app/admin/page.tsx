
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  Box,
  CheckCircle2,
  Clock3,
  LayoutDashboard,
  LogOut,
  Package,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase";

type Order = {
  id: string;
  created_at?: string;
  status?: string;
  payment_status?: string;
};

type Access = "checking" | "signed-out" | "unauthorized" | "error" | "ready";

export default function AdminPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [access, setAccess] = useState<Access>("checking");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const loadOrders = useCallback(async () => {
    setBusy(true);
    setMessage("");

    try {
      const supabase = supabaseBrowser();
      const { data, error } = await supabase.auth.getSession();

      if (error) throw error;

      const session = data.session;

      if (!session?.access_token) {
        setOrders([]);
        setEmail("");
        setAccess("signed-out");
        return;
      }

      const response = await fetch("/api/admin/orders", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      });

      const result = await response.json().catch(() => ({}));

      if (response.status === 401 || response.status === 403) {
        setOrders([]);
        setEmail("");
        setAccess("unauthorized");
        return;
      }

      if (!response.ok) {
        throw new Error(result.error || "Could not load orders.");
      }

      setOrders(Array.isArray(result.orders) ? result.orders : []);
      setEmail(session.user.email || "Admin");
      setAccess("ready");
    } catch (error) {
      setOrders([]);
      setMessage(
        error instanceof Error ? error.message : "Unable to connect."
      );
      setAccess("error");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    setOrders([]);
    setEmail("");
    setAccess("signed-out");
  }

  const total = orders.length;
  const pending = orders.filter((o) => o.payment_status === "pending").length;
  const paid = orders.filter((o) => o.payment_status === "paid").length;
  const active = orders.filter((o) =>
    ["placed", "packed", "dispatched"].includes(o.status || "")
  ).length;

  const stats = [
    { name: "Total orders", value: total, detail: "All loaded orders", icon: ShoppingBag, color: "purple" },
    { name: "Pending payments", value: pending, detail: "Awaiting verification", icon: Clock3, color: "amber" },
    { name: "Paid orders", value: paid, detail: "Server-confirmed payments", icon: CheckCircle2, color: "green" },
    { name: "Active orders", value: active, detail: "Placed, packed or dispatched", icon: Package, color: "blue" },
  ];

  function dateLabel(value?: string) {
    if (!value) return "Date unavailable";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Date unavailable";
    return date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function label(value?: string) {
    return (value || "unknown")
      .replaceAll("_", " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  return (
    <main className="shell">
      <div className="glow glow-a" />
      <div className="glow glow-b" />

      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon"><Sparkles size={19} /></div>
          <div>
            <strong>velfrok</strong>
            <small>BETTER LIVING</small>
          </div>
        </div>

        <div className="side-label">WORKSPACE</div>
        <div className="nav-item">
          <LayoutDashboard size={18} />
          Overview
        </div>

        <div className="side-bottom">
          <div className="security">
            <ShieldCheck size={18} />
            <span>
              <strong>Protected workspace</strong>
              <small>Server-verified admin access</small>
            </span>
          </div>

          {access === "ready" && (
            <button className="logout" onClick={signOut}>
              <LogOut size={17} /> Sign out
            </button>
          )}
        </div>
      </aside>

      <section className="main">
        <header className="topbar">
          <div>Workspace <span>/</span> <strong>Overview</strong></div>
          <div className="top-right">
            <span className="live-dot" />
            Admin console
            {access === "ready" && <b className="avatar">{email.charAt(0).toUpperCase()}</b>}
          </div>
        </header>

        <div className="content">
          <div className="welcome">
            <div>
              <div className="eyebrow">YOUR STORE, IN FOCUS</div>
              <h1>{access === "ready" ? "Good evening" : "Welcome to Velfrok"}<i>.</i></h1>
              <p>
                {access === "ready"
                  ? "Here's what's happening with your store today."
                  : "Your store management workspace."}
              </p>
            </div>

            {access === "ready" && (
              <button className="refresh" onClick={loadOrders} disabled={busy}>
                <RefreshCw size={16} className={busy ? "spin" : ""} />
                Refresh
              </button>
            )}
          </div>

          {access === "checking" && (
            <section className="state-panel">
              <div className="loader" />
              <h2>Verifying admin access</h2>
              <p>Checking your secure session. Please wait.</p>
            </section>
          )}

          {access === "signed-out" && (
            <section className="state-panel">
              <div className="state-icon"><ShieldCheck size={26} /></div>
              <h2>Sign in to continue</h2>
              <p>The admin dashboard is private. Sign in first, then your admin permissions will be checked securely.</p>
              <a className="primary" href="/login">Sign in to Velfrok</a>
              <a className="back-link" href="/">Back to storefront</a>
            </section>
          )}

          {access === "unauthorized" && (
            <section className="state-panel">
              <div className="state-icon warning"><ShieldCheck size={26} /></div>
              <h2>Admin access required</h2>
              <p>This account is signed in but is not authorized to access the admin dashboard.</p>
              <button className="secondary" onClick={signOut}>Sign out</button>
            </section>
          )}

          {access === "error" && (
            <section className="state-panel">
              <div className="state-icon warning"><Activity size={26} /></div>
              <h2>Unable to load dashboard</h2>
              <p>{message}</p>
              <button className="secondary" onClick={loadOrders}>Try again</button>
            </section>
          )}

          {access === "ready" && (
            <>
              <div className="stats">
                {stats.map((stat, index) => {
                  const Icon = stat.icon;
                  return (
                    <article className={`stat ${stat.color}`} key={stat.name} style={{ animationDelay: `${index * 80}ms` }}>
                      <div className="stat-icon"><Icon size={19} /></div>
                      <strong className="stat-value">{stat.value}</strong>
                      <b>{stat.name}</b>
                      <small>{stat.detail}</small>
                    </article>
                  );
                })}
              </div>

              <section className="orders">
                <div className="orders-heading">
                  <div>
                    <h2>Recent orders</h2>
                    <p>Latest orders received by your store</p>
                  </div>
                  <span><ShieldCheck size={14} /> Secure data</span>
                </div>

                {orders.length === 0 ? (
                  <div className="empty">
                    <Box size={27} />
                    <h3>Your store is ready</h3>
                    <p>New orders will appear here when customers check out.</p>
                  </div>
                ) : (
                  <div className="order-list">
                    {orders.slice(0, 12).map((order) => (
                      <article className="order" key={order.id}>
                        <div className="order-icon"><ShoppingBag size={17} /></div>
                        <div className="order-info">
                          <strong>Order #{order.id.slice(0, 8).toUpperCase()}</strong>
                          <small>{dateLabel(order.created_at)}</small>
                        </div>
                        <span className="status">{label(order.status)}</span>
                        <span className="payment">{label(order.payment_status)}</span>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

          <footer>
            <span><Activity size={14} /> Velfrok admin</span>
            <span>Better living. Better experience.</span>
          </footer>
        </div>
      </section>

      <style jsx>{`
        :global(*) { box-sizing: border-box; }
        :global(body) { margin: 0; background: #080a12; }
        .shell { min-height: 100vh; display: flex; position: relative; overflow: hidden; color: #f3f4fa; background: radial-gradient(ellipse at 80% 0%,rgba(98,75,180,.12),transparent 42%),#080a12; font-family: Arial, sans-serif; }
        .glow { position: fixed; width: 340px; height: 340px; border-radius: 50%; filter: blur(110px); opacity: .13; pointer-events: none; animation: float 12s ease-in-out infinite alternate; }
        .glow-a { background: #8b5cf6; top: -170px; right: 10%; }
        .glow-b { background: #2563eb; bottom: -200px; left: 30%; }
        .sidebar { width: 230px; flex-shrink: 0; min-height: 100vh; padding: 27px 17px 20px; display: flex; flex-direction: column; position: relative; z-index: 1; background: rgba(12,14,23,.9); border-right: 1px solid rgba(255,255,255,.07); }
        .brand { display: flex; align-items: center; gap: 11px; padding: 0 8px; margin-bottom: 50px; }
        .brand-icon { width: 39px; height: 39px; display: grid; place-items: center; border-radius: 13px; background: linear-gradient(140deg,#9b7aff,#5e43ce); box-shadow: 0 0 24px rgba(139,92,246,.3); }
        .brand strong { display: block; font-size: 20px; letter-spacing: -.8px; }
        .brand small { display: block; margin-top: 3px; font-size: 9px; letter-spacing: 2px; color: #777b91; }
        .side-label { padding: 0 12px; margin-bottom: 12px; font-size: 10px; letter-spacing: 1.8px; color: #656a7e; }
        .nav-item { display: flex; align-items: center; gap: 12px; padding: 13px 12px; border: 1px solid rgba(167,139,250,.14); border-radius: 11px; color: #d5caff; background: rgba(139,92,246,.13); font-size: 13px; }
        .side-bottom { margin-top: auto; }
        .security { display: flex; gap: 10px; padding: 13px 11px; margin-bottom: 15px; border: 1px solid rgba(255,255,255,.06); border-radius: 12px; color: #75d7b1; }
        .security span { display: block; }
        .security strong,.security small { display: block; }
        .security strong { color: #c9cede; font-size: 11px; margin-bottom: 5px; }
        .security small { color: #8d94aa; font-size: 10px; }
        .logout { display: flex; align-items: center; gap: 10px; width: 100%; padding: 12px; border: 0; border-radius: 10px; color: #9297a9; background: transparent; cursor: pointer; }
        .logout:hover { color: white; background: rgba(255,255,255,.05); }
        .main { min-width: 0; flex: 1; position: relative; z-index: 1; }
        .topbar { height: 76px; display: flex; align-items: center; justify-content: space-between; padding: 0 35px; border-bottom: 1px solid rgba(255,255,255,.06); color: #777c91; font-size: 12px; }
        .topbar span { color: #42465a; padding: 0 8px; }
        .topbar strong { color: #d9dbea; font-weight: 500; }
        .top-right { display: flex; align-items: center; gap: 9px; color: #a4a9bc; }
        .live-dot { width: 6px; height: 6px; padding: 0 !important; border-radius: 50%; background: #6ee7b7; box-shadow: 0 0 10px #6ee7b7; animation: pulse 2s infinite; }
        .avatar { width: 32px; height: 32px; display: grid; place-items: center; margin-left: 8px; border-radius: 10px; color: #c7b8ff; background: rgba(139,92,246,.16); }
        .content { max-width: 1400px; margin: auto; padding: 40px 35px 24px; }
        .welcome { display: flex; align-items: flex-end; justify-content: space-between; gap: 18px; margin-bottom: 30px; animation: rise .5s ease both; }
        .eyebrow { margin-bottom: 13px; color: #a99aff; font-size: 10px; font-weight: 700; letter-spacing: 1.8px; }
        h1 { margin: 0; font-size: clamp(30px,4vw,42px); letter-spacing: -1.7px; }
        h1 i { color: #a78bfa; font-style: normal; }
        .welcome p { margin: 10px 0 0; color: #888da2; font-size: 13px; }
        .refresh,.secondary,.primary { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 11px 15px; border: 1px solid rgba(167,139,250,.24); border-radius: 10px; color: #e4e0f5; background: rgba(139,92,246,.15); font-size: 12px; text-decoration: none; cursor: pointer; }
        button:disabled { opacity: .5; cursor: wait; }
        .state-panel { min-height: 320px; padding: 30px 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; border: 1px solid rgba(255,255,255,.075); border-radius: 17px; background: rgba(15,17,27,.85); animation: rise .5s ease both; }
        .state-panel h2 { margin: 16px 0 0; font-size: 18px; }
        .state-panel p { max-width: 390px; margin: 10px 0 20px; color: #858ba0; font-size: 12px; line-height: 1.7; }
        .state-icon { width: 54px; height: 54px; display: grid; place-items: center; border: 1px solid rgba(167,139,250,.18); border-radius: 16px; color: #b5a5ff; background: rgba(139,92,246,.1); }
        .warning { color: #f4c779; }
        .back-link { margin-top: 16px; color: #969bb0; font-size: 11px; text-decoration: none; }
        .loader { width: 35px; height: 35px; border: 2px solid rgba(167,139,250,.15); border-top-color: #a78bfa; border-radius: 50%; animation: spin .9s linear infinite; }
        .stats { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 15px; margin-bottom: 27px; }
        .stat { padding: 19px; border: 1px solid rgba(255,255,255,.075); border-radius: 15px; background: linear-gradient(145deg,rgba(23,25,39,.94),rgba(15,17,27,.9)); animation: rise .5s ease both; transition: transform .2s ease; }
        .stat:hover { transform: translateY(-4px); }
        .stat-icon { width: 37px; height: 37px; display: grid; place-items: center; margin-bottom: 18px; border-radius: 11px; background: rgba(255,255,255,.05); }
        .purple .stat-icon { color: #b8a5ff; }
        .amber .stat-icon { color: #f7c777; }
        .green .stat-icon { color: #7ce6bd; }
        .blue .stat-icon { color: #8ec5ff; }
        .stat-value { display: block; margin-bottom: 6px; font-size: 30px; }
        .stat b { display: block; color: #d9dbea; font-size: 12px; }
        .stat small { display: block; margin-top: 8px; color: #777c91; font-size: 10px; }
        .orders { overflow: hidden; border: 1px solid rgba(255,255,255,.075); border-radius: 16px; background: rgba(15,17,27,.85); animation: rise .6s ease both; }
        .orders-heading { display: flex; align-items: center; justify-content: space-between; padding: 21px 22px; border-bottom: 1px solid rgba(255,255,255,.06); }
        .orders-heading h2 { margin: 0; font-size: 15px; }
        .orders-heading p { margin: 7px 0 0; color: #7e8398; font-size: 11px; }
        .orders-heading span { display: flex; align-items: center; gap: 6px; color: #75d7b1; font-size: 10px; }
        .empty { min-height: 210px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #b5a5ff; text-align: center; }
        .empty h3 { margin: 14px 0 0; color: #e1e3ef; font-size: 14px; }
        .empty p { color: #858ba0; font-size: 12px; }
        .order-list { padding: 0 22px; }
        .order { display: flex; align-items: center; gap: 12px; padding: 15px 0; border-bottom: 1px solid rgba(255,255,255,.05); }
        .order-icon { width: 36px; height: 36px; display: grid; place-items: center; border-radius: 10px; color: #a99aff; background: rgba(139,92,246,.09); }
        .order-info { flex: 1; min-width: 0; }
        .order-info strong,.order-info small { display: block; }
        .order-info strong { color: #e1e3ef; font-size: 12px; }
        .order-info small { margin-top: 5px; color: #7b8094; font-size: 10px; }
        .status,.payment { padding: 6px 8px; border-radius: 7px; color: #a7adbf; background: rgba(255,255,255,.04); font-size: 10px; }
        footer { display: flex; justify-content: space-between; gap: 12px; padding-top: 20px; color: #5e6378; font-size: 10px; }
        footer span:first-child { display: flex; align-items: center; gap: 6px; }
        .spin { animation: spin .9s linear infinite; }
        @keyframes rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 50% { opacity: .4; } }
        @keyframes float { to { transform: translate3d(30px,25px,0); } }
        @media(max-width:1050px) { .sidebar { width: 195px; } .stats { grid-template-columns: repeat(2,minmax(0,1fr)); } .content { padding: 30px 24px; } }
        @media(max-width:700px) {
          .shell { display: block; }
          .sidebar { width: 100%; min-height: auto; padding: 14px 16px; flex-direction: row; align-items: center; justify-content: space-between; border-right: 0; border-bottom: 1px solid rgba(255,255,255,.07); }
          .brand { margin: 0; }
          .side-label,.nav-item,.security { display: none; }
          .side-bottom { margin: 0; }
          .logout { width: auto; font-size: 0; }
          .topbar { height: 58px; padding: 0 16px; }
          .content { padding: 27px 16px; }
          .welcome { align-items: flex-start; }
          .refresh { padding: 9px; font-size: 0; }
          .stats { gap: 10px; }
          .stat { padding: 14px; }
          .stat-value { font-size: 26px; }
          .order { flex-wrap: wrap; }
          .order-info { flex: 1; }
          .status,.payment { margin-left: 48px; }
          footer { flex-wrap: wrap; }
        }
        @media(prefers-reduced-motion:reduce) { *,*::before,*::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; } }
      `}</style>
    </main>
  );
}
