"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

type AccessState =
  | "checking"
  | "signed-out"
  | "unauthorized"
  | "error"
  | "ready";

function formatDate(value?: string) {
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

function readable(value?: string) {
  return (value || "unknown")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function AdminPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [access, setAccess] = useState<AccessState>("checking");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const loadOrders = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    else setAccess("checking");

    setMessage("");

    try {
      const supabase = supabaseBrowser();
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;

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
        setOrders([]);
        setMessage(result?.error || "Could not load orders.");
        setAccess("error");
        return;
      }

      setOrders(Array.isArray(result.orders) ? result.orders : []);
      setEmail(session.user.email || "Admin account");
      setAccess("ready");
    } catch {
      setOrders([]);
      setMessage("Unable to connect to the admin service. Please try again.");
      setAccess("error");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const stats = useMemo(() => [
    {
      label: "Total orders",
      value: orders.length,
      detail: "Orders received by your store",
      icon: ShoppingBag,
      color: "violet",
    },
    {
      label: "Pending payments",
      value: orders.filter((o) => o.payment_status === "pending").length,
      detail: "Awaiting payment verification",
      icon: Clock3,
      color: "amber",
    },
    {
      label: "Paid orders",
      value: orders.filter((o) => o.payment_status === "paid").length,
      detail: "Marked paid by the server",
      icon: CheckCircle2,
      color: "mint",
    },
    {
      label: "Active orders",
      value: orders.filter((o) =>
        ["placed", "packed", "dispatched"].includes(o.status || "")
      ).length,
      detail: "Placed, packed or dispatched",
      icon: Package,
      color: "blue",
    },
  ], [orders]);

  const signOut = async () => {
    await supabaseBrowser().auth.signOut();
    setOrders([]);
    setEmail("");
    setAccess("signed-out");
  };

  return (
    <main className="admin-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Sparkles size={19} /></div>
          <div>
            <div className="brand-name">velfrok</div>
            <div className="brand-caption">BETTER LIVING</div>
          </div>
        </div>

        <div className="sidebar-label">WORKSPACE</div>
        <div className="nav-item">
          <LayoutDashboard size={18} />
          Overview
        </div>

        <div className="sidebar-bottom">
          <div className="security-note">
            <ShieldCheck size={18} />
            <div>
              <strong>Protected workspace</strong>
              <span>Admin access is verified by the server.</span>
            </div>
          </div>

          {access === "ready" && (
            <button className="logout-button" onClick={signOut}>
              <LogOut size={17} /> Sign out
            </button>
          )}
        </div>
      </aside>

      <section className="dashboard">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span> <strong>Overview</strong>
          </div>
          <div className="topbar-right">
            <div className="live-indicator"><span /> Admin console</div>
            {access === "ready" && (
              <div className="avatar">{email.charAt(0).toUpperCase()}</div>
            )}
          </div>
        </header>

        <div className="content">
          <div className="welcome-row">
            <div>
              <div className="eyebrow">
                <span /> YOUR STORE, IN FOCUS
              </div>
              <h1>
                {access === "ready" ? "Good evening" : "Welcome to Velfrok"}
                <span>.</span>
              </h1>
              <p className="welcome-subtitle">
                {access === "ready"
                  ? "Here’s what’s happening with your store today."
                  : "Your store management workspace."}
              </p>
            </div>

            {access === "ready" && (
              <button
                className="refresh-button"
                onClick={() => loadOrders(true)}
                disabled={refreshing}
              >
                <RefreshCw size={16} className={refreshing ? "spin" : ""} />
                Refresh
              </button>
            )}
          </div>

          {access === "checking" && (
            <section className="state-panel">
              <div className="loader-orbit"><span /></div>
              <h2>Verifying admin access</h2>
              <p>Checking your secure session. Please wait…</p>
            </section>
          )}

          {access === "signed-out" && (
            <section className="state-panel">
              <div className="state-icon"><ShieldCheck size={25} /></div>
              <h2>Sign in to continue</h2>
              <p>
                The admin dashboard is private. Sign in first, then your
                admin permissions will be checked securely.
              </p>
              <a className="primary-button" href="/login">
                Sign in to Velfrok
              </a>
              <a className="back-link" href="/">Back to storefront</a>
            </section>
          )}

          {access === "unauthorized" && (
            <section className="state-panel">
              <div className="state-icon warning"><ShieldCheck size={25} /></div>
              <h2>Admin access required</h2>
              <p>
                You are signed in, but this account is not authorized
                to access the admin dashboard.
              </p>
              <button className="secondary-button" onClick={signOut}>
                Sign out
              </button>
            </section>
          )}

          {access === "error" && (
            <section className="state-panel">
              <div className="state-icon warning"><Activity size={25} /></div>
              <h2>Unable to load dashboard</h2>
              <p>{message}</p>
              <button
                className="secondary-button"
                onClick={() => loadOrders(true)}
                disabled={refreshing}
              >
                Try again
              </button>
            </section>
          )}

          {access === "ready" && (
            <>
              <div className="stats-grid">
                {stats.map((stat, index) => {
                  const Icon = stat.icon;
                  return (
                    <article
                      className={`stat-card stat-${stat.color}`}
                      key={stat.label}
                      style={{ animationDelay: `${index * 90}ms` }}
                    >
                      <div className="stat-top">
                        <div className="stat-icon"><Icon size={19} /></div>
                      </div>
                      <div className="stat-value">{stat.value}</div>
                      <div className="stat-label">{stat.label}</div>
                      <div className="stat-detail">{stat.detail}</div>
                    </article>
                  );
                })}
              </div>

              <section className="orders-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Recent orders</h2>
                    <p>Latest orders received by your store</p>
                  </div>
                  <div className="secure-label">
                    <ShieldCheck size={14} /> Secure data
                  </div>
                </div>

                {orders.length === 0 ? (
                  <div className="empty-state">
                    <div className="state-icon"><Box size={24} /></div>
                    <h2>Your store is ready</h2>
                    <p>New orders will appear here when customers check out.</p>
                  </div>
                ) : (
                  <div className="orders-list">
                    {orders.slice(0, 12).map((order, index) => (
                      <article
                        className="order-row"
                        key={order.id}
                        style={{ animationDelay: `${index * 45}ms` }}
                      >
                        <div className="order-symbol"><ShoppingBag size={17} /></div>
                        <div className="order-main">
                          <strong>Order #{order.id.slice(0, 8).toUpperCase()}</strong>
                          <span>{formatDate(order.created_at)}</span>
                        </div>
                        <div className="order-statuses">
                          <span className="status-chip">{readable(order.status)}</span>
                          <span className="payment-chip">{readable(order.payment_status)}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

          <footer className="dashboard-footer">
            <span><Activity size={14} /> Velfrok admin</span>
            <span>Better living. Better experience.</span>
          </footer>
        </div>
      </section>

      <style jsx>{`
        :global(*) { box-sizing: border-box; }
        :global(body) { margin: 0; background: #080a12; }

        .admin-shell {
          min-height: 100vh;
          display: flex;
          overflow: hidden;
          position: relative;
          color: #f3f4fa;
          background: radial-gradient(ellipse at 80% 0%, rgba(98,75,180,.12), transparent 42%), #080a12;
          font-family: Arial, Helvetica, sans-serif;
        }

        .ambient {
          position: fixed;
          width: 380px;
          height: 380px;
          border-radius: 50%;
          filter: blur(110px);
          opacity: .12;
          pointer-events: none;
          animation: float 12s ease-in-out infinite alternate;
        }
        .ambient-one { background: #8b5cf6; top: -180px; right: 10%; }
        .ambient-two { background: #2563eb; bottom: -220px; left: 30%; }

        .sidebar {
          width: 238px;
          flex-shrink: 0;
          min-height: 100vh;
          padding: 28px 17px 20px;
          display: flex;
          flex-direction: column;
          position: relative;
          z-index: 1;
          background: rgba(12,14,23,.86);
          border-right: 1px solid rgba(255,255,255,.07);
          backdrop-filter: blur(20px);
        }
        .brand { display:flex; align-items:center; gap:11px; padding:0 8px; margin-bottom:52px; }
        .brand-mark {
          width:39px; height:39px; display:grid; place-items:center;
          color:white; border-radius:13px;
          background:linear-gradient(140deg,#9b7aff,#5e43ce);
          box-shadow:0 0 24px rgba(139,92,246,.3);
        }
        .brand-name { font-size:20px; font-weight:800; letter-spacing:-.8px; }
        .brand-caption { margin-top:3px; font-size:9px; letter-spacing:2.2px; color:#777b91; }
        .sidebar-label { padding:0 12px; margin-bottom:12px; font-size:10px; font-weight:700; letter-spacing:1.8px; color:#656a7e; }
        .nav-item {
          display:flex; align-items:center; gap:12px; padding:13px 12px;
          border-radius:11px; color:#d5caff; font-size:13px;
          background:rgba(139,92,246,.13);
          border:1px solid rgba(167,139,250,.14);
        }
        .sidebar-bottom { margin-top:auto; }
        .security-note {
          display:flex; gap:10px; padding:13px 11px; margin-bottom:17px;
          color:#8d94aa; border:1px solid rgba(255,255,255,.06);
          background:rgba(255,255,255,.025); border-radius:12px;
        }
        .security-note :global(svg) { color:#75d7b1; flex-shrink:0; }
        .security-note strong,.security-note span { display:block; }
        .security-note strong { margin-bottom:5px; color:#c9cede; font-size:11px; }
        .security-note span { font-size:10px; line-height:1.5; }
        .logout-button {
          display:flex; align-items:center; gap:10px; width:100%;
          padding:12px; color:#9297a9; background:transparent;
          border:0; border-radius:10px; cursor:pointer; text-align:left;
        }
        .logout-button:hover { color:white; background:rgba(255,255,255,.05); }

        .dashboard { min-width:0; flex:1; position:relative; z-index:1; }
        .topbar {
          height:78px; display:flex; align-items:center; justify-content:space-between;
          padding:0 38px; border-bottom:1px solid rgba(255,255,255,.06);
          background:rgba(10,12,20,.45); backdrop-filter:blur(16px);
        }
        .breadcrumb,.topbar-right { display:flex; align-items:center; gap:12px; font-size:12px; }
        .breadcrumb { color:#777c91; }
        .breadcrumb span { color:#42465a; }
        .breadcrumb strong { color:#d9dbea; font-weight:500; }
        .topbar-right { gap:15px; }
        .live-indicator { display:flex; align-items:center; gap:8px; color:#a4a9bc; font-size:11px; }
        .live-indicator span { width:6px; height:6px; border-radius:50%; background:#6ee7b7; box-shadow:0 0 10px #6ee7b7; animation:pulse 2s infinite; }
        .avatar {
          width:33px; height:33px; display:grid; place-items:center;
          border:1px solid rgba(167,139,250,.3); border-radius:11px;
          background:rgba(139,92,246,.16); color:#c7b8ff; font-size:13px; font-weight:700;
        }

        .content { max-width:1440px; margin:0 auto; padding:42px 38px 25px; }
        .welcome-row {
          display:flex; justify-content:space-between; align-items:flex-end;
          gap:20px; margin-bottom:31px; animation:rise 600ms ease both;
        }
        .eyebrow { display:flex; align-items:center; gap:9px; margin-bottom:13px; color:#a99aff; font-size:10px; font-weight:700; letter-spacing:1.8px; }
        .eyebrow span { width:20px; height:1px; background:#a78bfa; }
        h1 { margin:0; font-size:clamp(30px,4vw,42px); font-weight:750; letter-spacing:-1.7px; }
        h1 span { color:#a78bfa; }
        .welcome-subtitle { margin:11px 0 0; color:#888da2; font-size:13px; }
        .refresh-button,.secondary-button,.primary-button {
          display:inline-flex; align-items:center; justify-content:center; gap:9px;
          padding:11px 15px; color:#e4e0f5; background:rgba(139,92,246,.15);
          border:1px solid rgba(167,139,250,.24); border-radius:10px;
          font-size:12px; cursor:pointer; text-decoration:none; transition:180ms ease;
        }
        .refresh-button:hover,.secondary-button:hover,.primary-button:hover { background:rgba(139,92,246,.25); }
        button:disabled { opacity:.5; cursor:wait; }

        .state-panel {
          min-height:330px; padding:35px 20px; display:flex; flex-direction:column;
          align-items:center; justify-content:center; text-align:center;
          border:1px solid rgba(255,255,255,.075); border-radius:17px;
          background:rgba(15,17,27,.82); animation:rise 500ms ease both;
        }
        .state-panel h2 { margin:17px 0 0; color:#e5e4f0; font-size:18px; }
        .state-panel p { max-width:390px; margin:10px 0 20px; color:#858ba0; font-size:12px; line-height:1.7; }
        .state-icon {
          width:54px; height:54px; display:grid; place-items:center;
          color:#b5a5ff; border:1px solid rgba(167,139,250,.18);
          border-radius:16px; background:rgba(139,92,246,.1);
        }
        .warning { color:#f4c779; border-color:rgba(245,158,11,.18); background:rgba(245,158,11,.08); }
        .primary-button { padding:13px 22px; color:white; font-weight:700; }
        .back-link { margin-top:17px; color:#969bb0; font-size:11px; text-decoration:none; }
        .back-link:hover { color:white; }

        .stats-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:16px; margin-bottom:28px; }
        .stat-card {
          min-width:0; padding:20px; position:relative; overflow:hidden;
          border:1px solid rgba(255,255,255,.075); border-radius:16px;
          background:linear-gradient(145deg,rgba(23,25,39,.92),rgba(15,17,27,.85));
          animation:rise 550ms ease both; transition:transform 220ms ease,border-color 220ms ease;
        }
        .stat-card:hover { transform:translateY(-4px); border-color:rgba(167,139,250,.25); }
        .stat-violet { --tone:#b8a5ff; }
        .stat-amber { --tone:#f7c777; }
        .stat-mint { --tone:#7ce6bd; }
        .stat-blue { --tone:#8ec5ff; }
        .stat-icon {
          width:38px; height:38px; display:grid; place-items:center;
          color:var(--tone); border:1px solid rgba(255,255,255,.08);
          border-radius:12px; background:rgba(255,255,255,.04);
        }
        .stat-top { margin-bottom:20px; }
        .stat-value { margin-bottom:5px; font-size:31px; font-weight:750; letter-spacing:-1px; }
        .stat-label { color:#d9dbea; font-size:12px; font-weight:600; }
        .stat-detail { margin-top:8px; color:#777c91; font-size:10px; line-height:1.5; }

        .orders-panel { overflow:hidden; border:1px solid rgba(255,255,255,.075); border-radius:16px; background:rgba(15,17,27,.82); animation:rise 650ms ease both; }
        .panel-heading { display:flex; align-items:center; justify-content:space-between; padding:22px 23px; border-bottom:1px solid rgba(255,255,255,.06); }
        .panel-heading h2 { margin:0; font-size:15px; }
        .panel-heading p { margin:7px 0 0; color:#7e8398; font-size:11px; }
        .secure-label { display:flex; align-items:center; gap:6px; color:#75d7b1; font-size:10px; }
        .orders-list { padding:0 22px; }
        .order-row { display:flex; align-items:center; gap:13px; padding:16px 0; border-bottom:1px solid rgba(255,255,255,.045); animation:rise 400ms ease both; }
        .order-row:last-child { border-bottom:0; }
        .order-symbol { width:38px; height:38px; flex-shrink:0; display:grid; place-items:center; color:#a99aff; border:1px solid rgba(167,139,250,.13); border-radius:11px; background:rgba(139,92,246,.09)
