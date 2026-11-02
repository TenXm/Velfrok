"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowUpRight,
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

type AdminOrder = {
  id: string;
  created_at?: string;
  status?: string;
  payment_status?: string;
};

const formatDate = (value?: string) => {
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
};

const shortId = (id: string) => id.slice(0, 8).toUpperCase();

const readable = (value?: string) =>
  (value || "unknown")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function AdminPage() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const loadOrders = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    else setLoading(true);

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
        setMessage("Sign in with an authorized admin account to continue.");
        return;
      }

      setEmail(session.user.email || "Admin account");

      const response = await fetch("/api/admin/orders", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setOrders([]);
        setMessage(
          response.status === 401 || response.status === 403
            ? "This account is not authorized to access the admin dashboard."
            : result?.error || "Could not load orders. Please try again."
        );
        return;
      }

      setOrders(Array.isArray(result.orders) ? result.orders : []);
    } catch {
      setOrders([]);
      setMessage("Could not connect to the admin service. Please try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const stats = useMemo(() => {
    const pending = orders.filter(
      (order) => order.payment_status === "pending"
    ).length;

    const paid = orders.filter(
      (order) => order.payment_status === "paid"
    ).length;

    const active = orders.filter(
      (order) =>
        ["placed", "packed", "dispatched"].includes(order.status || "")
    ).length;

    return [
      {
        label: "Total orders",
        value: orders.length,
        detail: "Orders returned by the admin service",
        icon: ShoppingBag,
        color: "violet",
      },
      {
        label: "Pending payments",
        value: pending,
        detail: "Awaiting payment verification",
        icon: Clock3,
        color: "amber",
      },
      {
        label: "Paid orders",
        value: paid,
        detail: "Marked paid by the server",
        icon: CheckCircle2,
        color: "mint",
      },
      {
        label: "Active orders",
        value: active,
        detail: "Placed, packed or dispatched",
        icon: Package,
        color: "blue",
      },
    ];
  }, [orders]);

  return (
    <main className="admin-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Sparkles size={19} />
          </div>
          <div>
            <div className="brand-name">velfrok</div>
            <div className="brand-caption">BETTER LIVING</div>
          </div>
        </div>

        <div className="sidebar-label">WORKSPACE</div>

        <div className="nav-item nav-active">
          <LayoutDashboard size={18} />
          <span>Overview</span>
          <span className="nav-dot" />
        </div>

        <div className="sidebar-bottom">
          <div className="security-note">
            <ShieldCheck size={18} />
            <div>
              <strong>Protected workspace</strong>
              <span>Admin access is verified server-side.</span>
            </div>
          </div>

          <button
            className="logout-button"
            onClick={async () => {
              await supabaseBrowser().auth.signOut();
              window.location.href = "/";
            }}
          >
            <LogOut size={17} />
            Sign out
          </button>
        </div>
      </aside>

      <section className="dashboard">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <span className="crumb-slash">/</span>
            <strong>Overview</strong>
          </div>

          <div className="topbar-right">
            <div className="live-indicator">
              <span />
              Admin console
            </div>
            <div className="avatar">
              {(email || "A").charAt(0).toUpperCase()}
            </div>
          </div>
        </header>

        <div className="content">
          <div className="welcome-row">
            <div>
              <div className="eyebrow">
                <span className="eyebrow-line" />
                YOUR STORE, IN FOCUS
              </div>
              <h1>
                Good evening<span className="title-period">.</span>
              </h1>
              <p className="welcome-subtitle">
                Here’s what’s happening with your store today.
              </p>
            </div>

            <button
              className="refresh-button"
              onClick={() => loadOrders(true)}
              disabled={refreshing || loading}
            >
              <RefreshCw
                size={16}
                className={refreshing ? "spin" : ""}
              />
              {refreshing ? "Refreshing" : "Refresh"}
            </button>
          </div>

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
                    <div className="stat-icon">
                      <Icon size={19} />
                    </div>
                    <ArrowUpRight size={16} className="stat-arrow" />
                  </div>
                  <div className="stat-value">
                    {loading ? (
                      <span className="skeleton-value" />
                    ) : (
                      stat.value
                    )}
                  </div>
                  <div className="stat-label">{stat.label}</div>
                  <div className="stat-detail">{stat.detail}</div>
                </article>
              );
            })}
          </div>

          <section className="orders-panel">
            <div className="panel-heading">
              <div>
                <div className="panel-title-row">
                  <h2>Recent orders</h2>
                  <span className="count-pill">{orders.length}</span>
                </div>
                <p>Latest orders received by your store</p>
              </div>

              <div className="secure-label">
                <ShieldCheck size={14} />
                Secure data
              </div>
            </div>

            {message ? (
              <div className="message-state">
                <div className="message-icon">
                  <ShieldCheck size={22} />
                </div>
                <strong>Admin access required</strong>
                <p>{message}</p>
                <button
                  className="retry-button"
                  onClick={() => loadOrders(true)}
                  disabled={refreshing}
                >
                  Try again
                </button>
              </div>
            ) : loading ? (
              <div className="loading-state">
                <div className="loader-orbit">
                  <span />
                </div>
                <p>Loading your orders securely…</p>
              </div>
            ) : orders.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <Box size={24} />
                </div>
                <strong>Your store is ready</strong>
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
                    <div className="order-symbol">
                      <ShoppingBag size={17} />
                    </div>

                    <div className="order-main">
                      <strong>Order #{shortId(order.id)}</strong>
                      <span>{formatDate(order.created_at)}</span>
                    </div>

                    <div className="order-statuses">
                      <span
                        className={`status-chip status-${(
                          order.status || "unknown"
                        ).toLowerCase()}`}
                      >
                        {readable(order.status)}
                      </span>
                      <span
                        className={`payment-chip payment-${(
                          order.payment_status || "unknown"
                        ).toLowerCase()}`}
                      >
                        {readable(order.payment_status)}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <footer className="dashboard-footer">
            <span>
              <Activity size={14} />
              Velfrok admin
            </span>
            <span>Better living. Better experience.</span>
          </footer>
        </div>
      </section>

      <style jsx>{`
        :global(*) {
          box-sizing: border-box;
        }

        :global(body) {
          margin: 0;
          background: #080a12;
        }

        .admin-shell {
          min-height: 100vh;
          display: flex;
          overflow: hidden;
          position: relative;
          color: #f3f4fa;
          background:
            radial-gradient(
              ellipse at 80% 0%,
              rgba(98, 75, 180, 0.12),
              transparent 42%
            ),
            #080a12;
          font-family: Arial, Helvetica, sans-serif;
        }

        .ambient {
          position: fixed;
          width: 380px;
          height: 380px;
          border-radius: 50%;
          filter: blur(110px);
          opacity: 0.12;
          pointer-events: none;
          animation: float 12s ease-in-out infinite alternate;
        }

        .ambient-one {
          background: #8b5cf6;
          top: -180px;
          right: 10%;
        }

        .ambient-two {
          background: #2563eb;
          bottom: -220px;
          left: 30%;
          animation-delay: -5s;
        }

        .sidebar {
          width: 238px;
          flex-shrink: 0;
          min-height: 100vh;
          padding: 28px 17px 20px;
          display: flex;
          flex-direction: column;
          position: relative;
          z-index: 1;
          background: rgba(12, 14, 23, 0.86);
          border-right: 1px solid rgba(255, 255, 255, 0.07);
          backdrop-filter: blur(20px);
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 11px;
          padding: 0 8px;
          margin-bottom: 52px;
        }

        .brand-mark {
          width: 39px;
          height: 39px;
          display: grid;
          place-items: center;
          color: white;
          border-radius: 13px;
          background: linear-gradient(140deg, #9b7aff, #5e43ce);
          box-shadow: 0 0 24px rgba(139, 92, 246, 0.3);
        }

        .brand-name {
          font-size: 20px;
          font-weight: 800;
          letter-spacing: -0.8px;
        }

        .brand-caption {
          margin-top: 3px;
          font-size: 9px;
          letter-spacing: 2.2px;
          color: #777b91;
        }

        .sidebar-label {
          padding: 0 12px;
          margin-bottom: 12px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 1.8px;
          color: #656a7e;
        }

        .nav-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 13px 12px;
          border-radius: 11px;
          color: #8b90a5;
          font-size: 13px;
          transition: 180ms ease;
        }

        .nav-active {
          color: #f5f1ff;
          background: linear-gradient(
            100deg,
            rgba(139, 92, 246, 0.2),
            rgba(139, 92, 246, 0.06)
          );
          border: 1px solid rgba(167, 139, 250, 0.14);
        }

        .nav-dot {
          width: 5px;
          height: 5px;
          margin-left: auto;
          border-radius: 50%;
          background: #a78bfa;
          box-shadow: 0 0 10px #a78bfa;
        }

        .sidebar-bottom {
          margin-top: auto;
        }

        .security-note {
          display: flex;
          gap: 10px;
          padding: 13px 11px;
          margin-bottom: 17px;
          color: #8d94aa;
          border: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(255, 255, 255, 0.025);
          border-radius: 12px;
        }

        .security-note :global(svg) {
          color: #75d7b1;
          flex-shrink: 0;
        }

        .security-note strong,
        .security-note span {
          display: block;
        }

        .security-note strong {
          margin-bottom: 5px;
          color: #c9cede;
          font-size: 11px;
        }

        .security-note span {
          font-size: 10px;
          line-height: 1.5;
        }

        .logout-button {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 12px;
          color: #9297a9;
          background: transparent;
          border: 0;
          border-radius: 10px;
          cursor: pointer;
          text-align: left;
        }

        .logout-button:hover {
          color: #fff;
          background: rgba(255, 255, 255, 0.05);
        }

        .dashboard {
          min-width: 0;
          flex: 1;
          position: relative;
          z-index: 1;
        }

        .topbar {
          height: 78px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 38px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(10, 12, 20, 0.45);
          backdrop-filter: blur(16px);
        }

        .breadcrumb,
        .topbar-right {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 12px;
        }

        .breadcrumb {
          color: #777c91;
        }

        .breadcrumb strong {
          color: #d9dbea;
          font-weight: 500;
        }

        .crumb-slash {
          color: #42465a;
        }

        .topbar-right {
          gap: 15px;
        }

        .live-indicator {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #a4a9bc;
          font-size: 11px;
        }

        .live-indicator span {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #6ee7b7;
          box-shadow: 0 0 10px rgba(110, 231, 183, 0.7);
          animation: pulse 2s infinite;
        }

        .avatar {
          width: 33px;
          height: 33px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(167, 139, 250, 0.3);
          border-radius: 11px;
          background: rgba(139, 92, 246, 0.16);
          color: #c7b8ff;
          font-size: 13px;
          font-weight: 700;
        }

        .content {
          max-width: 1440px;
          margin: 0 auto;
          padding: 42px 38px 25px;
        }

        .welcome-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 20px;
          margin-bottom: 31px;
          animation: rise 600ms ease both;
        }

        .eyebrow {
          display: flex;
          align-items: center;
          gap: 9px;
          margin-bottom: 13px;
          color: #a99aff;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 1.8px;
        }

        .eyebrow-line {
          width: 20px;
          height: 1px;
          background: #a78bfa;
        }

        h1 {
          margin: 0;
          font-size: clamp(30px, 4vw, 42px);
          font-weight: 750;
          letter-spacing: -1.7px;
        }

        .title-period {
          color: #a78bfa;
        }

        .welcome-subtitle {
          margin: 11px 0 0;
          color: #888da2;
          font-size: 13px;
        }

        .refresh-button,
        .retry-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          padding: 10px 14px;
          color: #d8d9e7;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.09);
          border-radius: 10px;
          font-size: 12px;
          cursor: pointer;
          transition: 180ms ease;
        }

        .refresh-button:hover,
        .retry-button:hover {
          border-color: rgba(167, 139, 250, 0.4);
          background: rgba(139, 92, 246, 0.1);
        }

        .refresh-button:disabled,
        .retry-button:disabled {
          opacity: 0.5;
          cursor: wait;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 16px;
          margin-bottom: 28px;
        }

        .stat-card {
          min-width: 0;
          padding: 20px;
          position: relative;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.075);
          border-radius: 16px;
          background: linear-gradient(
            145deg,
            rgba(23, 25, 39, 0.92),
            rgba(15, 17, 27, 0.85)
          );
          animation: rise 550ms ease both;
          transition:
            transform 220ms ease,
            border-color 220ms ease;
        }

        .stat-card:hover {
          transform: translateY(-4px);
          border-color: rgba(167, 139, 250, 0.25);
        }

        .stat-card::after {
          content: "";
          position: absolute;
          width: 100px;
          height: 100px;
          top: -58px;
          right: -45px;
          border-radius: 50%;
          background: var(--glow);
          filter: blur(35px);
          opacity: 0.25;
        }

        .stat-violet {
          --glow: #8b5cf6;
          --tone: #b8a5ff;
        }

        .stat-amber {
          --glow: #f59e0b;
          --tone: #f7c777;
        }

        .stat-mint {
          --glow: #34d399;
          --tone: #7ce6bd;
        }

        .stat-blue {
          --glow: #60a5fa;
          --tone: #8ec5ff;
        }

        .stat-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 20px;
        }

        .stat-icon {
          width: 38px;
          height: 38px;
          display: grid;
          place-items: center;
          color: var(--tone);
          border: 1px solid color-mix(in srgb, var(--tone) 20%, transparent);
          border-radius: 12px;
          background: color-mix(in srgb, var(--tone) 9%, transparent);
        }

        .stat-arrow {
          color: #5d6277;
        }

        .stat-value {
          min-height: 38px;
          margin-bottom: 5px;
          font-size: 31px;
          font-weight: 750;
          letter-spacing: -1px;
        }

        .stat-label {
          color: #d9dbea;
          font-size: 12px;
          font-weight: 600;
        }

        .stat-detail {
          margin-top: 8px;
          color: #777c91;
          font-size: 10px;
          line-height: 1.5;
        }

        .skeleton-value {
          display: inline-block;
          width: 55px;
          height: 27px;
          border-radius: 6px;
          background: linear-gradient(
            90deg,
            #202333,
            #34384d,
            #202333
          );
          background-size: 200% 100%;
          animation: shimmer 1.4s infinite;
        }

        .orders-panel {
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.075);
          border-radius: 16px;
          background: rgba(15, 17, 27, 0.82);
          animation: rise 650ms ease both;
          animation-delay: 250ms;
        }

        .panel-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 15px;
          padding: 22px 23px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .panel-title-row {
          display: flex;
          align-items: center;
          gap: 11px;
        }

        h2 {
          margin: 0;
          font-size: 15px;
          font-weight: 650;
          letter-spacing: -0.2px;
        }

        .panel-heading p {
          margin: 7px 0 0;
          color: #7e8398;
          font-size: 11px;
        }

        .count-pill {
          padding: 4px 8px;
          color: #b9a9ff;
          border: 1px solid rgba(167, 139, 250, 0.17);
          border-radius: 7px;
          background: rgba(139, 92, 246, 0.1);
          font-size: 10px;
        }

        .secure-label {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #75d7b1;
          font-size: 10px;
        }

        .orders-list {
          padding: 0 22px;
        }

        .order-row {
          display: flex;
          align-items: center;
          gap: 13px;
          padding: 16px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.045);
          animation: rise 400ms ease both;
        }

        .order-row:last-child {
          border-bottom: 0;
        }

        .order-symbol {
          width: 38px;
          height: 38px;
          flex-shrink: 0;
          display: grid;
          place-items: center;
          color: #a99aff;
          border: 1px solid rgba(167, 139, 250, 0.13);
          border-radius: 11px;
          background: rgba(139, 92, 246, 0.09);
        }

        .order-main {
          min-width: 0;
          display: flex;
          flex: 1;
          flex-direction: column;
          gap: 6px;
        }

        .order-main strong {
          color: #e1e3ef;
          font-size: 12px;
          font-weight: 600;
        }

        .order-main span {
          color: #7b8094;
          font-size: 10px;
        }

        .order-statuses {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 7px;
        }

        .status-chip,
        .payment-chip {
          padding: 6px 9px;
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 7px;
          color: #a7adbf;
          background: rgba(255, 255, 255, 0.035);
          font-size: 10px;
          white-space: nowrap;
        }

        .status-delivered,
        .payment-paid {
          color: #7ce6bd;
          border-color: rgba(52, 211, 153, 0.14);
          background: rgba(52, 211, 153, 0.07);
        }

        .status-placed,
        .status-packed,
        .payment-pending {
          color: #f4c779;
          border-color: rgba(245, 158, 11, 0.14);
          background: rgba(245, 158, 11, 0.07);
        }

        .status-dispatched {
          color: #8ec5ff;
          border-color: rgba(96, 165, 250, 0.14);
          background: rgba(96, 165, 250, 0.07);
        }

        .status-cancelled,
        .payment-failed {
          color: #f69aab;
          border-color: rgba(244, 114, 182, 0.14);
          background: rgba(244, 114, 182, 0.07);
        }

        .loading-state,
        .empty-state,
        .message-state {
          min-height: 235px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 30px;
          text-align: center;
        }

        .loading-state p,
        .empty-state p,
        .message-state p {
          max-width: 330px;
          margin: 12px 0 0;
          color: #858ba0;
          font-size: 12px;
          line-height: 1.6;
        }

        .empty-state strong,
        .message-state strong {
          margin-top: 14px;
          color: #e1e3ef;
          font-size: 13px;
        }

        .empty-icon,
        .message-icon {
          width: 50px;
          height: 50px;
          display: grid;
          place-items: center;
          color: #b5a5ff;
          border: 1px solid rgba(167, 139, 250, 0.18);
          border-radius: 15px;
          background: rgba(139, 92, 246, 0.1);
        }

        .message-icon {
          color: #f4c779;
          border-color: rgba(245, 158, 11, 0.15);
          background: rgba(245, 158, 11, 0.07);
        }

        .retry-button {
          margin-top: 17px;
        }

        .loader-orbit {
          width: 35px;
          height: 35px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(167, 139, 250, 0.15);
          border-top-color: #a78bfa;
          border-radius: 50%;
          animation: spin 900ms linear infinite;
        }

        .loader-orbit span {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #a78bfa;
          box-shadow: 0 0 12px #a78bfa;
        }

        .dashboard-footer {
          display: flex;
          justify-content: space-between;
          gap: 15px;
          padding: 21px 2px 0;
          color: #5e6378;
          font-size: 10px;
        }

        .dashboard-footer span:first-child {
          display: flex;
          align-items: center;
          gap: 7px;
        }

        .spin {
          animation: spin 900ms linear infinite;
        }

        @keyframes rise {
          from {
            opacity: 0;
            transform: translateY(13px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes pulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.4;
          }
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes shimmer {
          to {
            background-position: -200% 0;
          }
        }

        @keyframes float {
          from {
            transform: translate3d(-15px, -10px, 0);
          }
          to {
            transform: translate3d(35px, 30px, 0);
          }
        }

        @media (max-width: 1100px) {
          .sidebar {
            width: 205px;
          }

          .content {
            padding: 32px 25px 22px;
          }

          .topbar {
            padding: 0 25px;
          }

          .stats-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 720px) {
          .admin-shell {
            display: block;
          }

          .sidebar {
            width: 100%;
            min-height: auto;
            padding: 15px 17px;
            flex-direction: row;
            align-items: center;
            justify-content: space-between;
            border-right: 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.07);
          }

          .brand {
            margin: 0;
          }

          .brand-mark {
            width: 35px;
            height: 35px;
          }

          .sidebar-label,
          .nav-item,
          .security-note {
            display: none;
          }

          .sidebar-bottom {
            margin: 0;
          }

          .logout-button {
            width: auto;
            padding: 9px;
            font-size: 0;
          }

          .logout-button :global(svg) {
            width: 18px;
            height: 18px;
          }

          .topbar {
            height: 60px;
            padding: 0 18px;
          }

          .content {
            padding: 29px 17px 22px;
          }

          .welcome-row {
            align-items: flex-start;
          }

          .welcome-subtitle {
            max-width: 240px;
            line-height: 1.6;
          }

          .refresh-button {
            padding: 9px;
            font-size: 0;
          }

          .refresh-button :global(svg) {
            width: 17px;
            height: 17px;
          }

          .stats-grid {
            gap: 11px;
          }

          .stat-card {
            padding: 15px;
            border-radius: 13px;
          }

          .stat-value {
            font-size: 27px;
          }

          .stat-detail {
            min-height: 30px;
          }

          .panel-heading {
            padding: 18px 16px;
          }

          .orders-list {
            padding: 0 15px;
          }

          .order-row {
            align-items: flex-start;
            flex-wrap: wrap;
          }

          .order-main {
            padding-top: 3px;
          }

          .order-statuses {
            width: 100%;
            padding-left: 51px;
            justify-content: flex-start;
          }

          .dashboard-footer {
            flex-wrap: wrap;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          *,
          *::before,
          *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </main>
  );
}
