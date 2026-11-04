"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase";

type OrderItem = {
  sku: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  image_url: string | null;
};

type Order = {
  id: string;
  order_number: string;
  customer_name: string;
  mobile: string;
  email: string;
  street_address: string;
  city: string;
  state: string;
  pin_code: string;
  subtotal: number;
  total: number;
  payment_status: string;
  fulfillment_status: string;
  utr_number: string | null;
  created_at: string;
  order_items: OrderItem[];
};

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const token = useCallback(async () => {
    const { data, error } = await supabaseBrowser().auth.getSession();

    if (error) throw error;

    if (!data.session?.access_token) {
      throw new Error("Please sign in again to use the admin panel.");
    }

    return data.session.access_token;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const accessToken = await token();

      const response = await fetch("/api/admin/orders", {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || "Could not load orders.");
      }

      setOrders(Array.isArray(result.orders) ? result.orders : []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load orders."
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function update(
    orderId: string,
    changes: {
      paymentStatus?: string;
      fulfillmentStatus?: string;
    }
  ): Promise<boolean> {
    setBusyId(orderId);
    setError("");
    setMessage("");

    try {
      const accessToken = await token();

      const response = await fetch("/api/admin/orders", {
        method: "PATCH",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orderId,
          ...changes,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || "Could not update order.");
      }

      setMessage("Order updated.");
      await load();

      return true;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update order."
      );

      return false;
    } finally {
      setBusyId("");
    }
  }

  async function bulkPayment(status: "accepted" | "rejected") {
    if (!selected.length) return;

    const confirmed = window.confirm(
      `${status === "accepted" ? "Accept" : "Reject"} payment for ${
        selected.length
      } selected order(s)?`
    );

    if (!confirmed) return;

    setError("");
    setMessage("");

    let succeeded = 0;
    let failed = 0;

    for (const id of selected) {
      const success = await update(id, {
        paymentStatus: status,
      });

      if (success) {
        succeeded += 1;
      } else {
        failed += 1;
      }
    }

    setSelected([]);

    if (failed === 0) {
      setMessage(
        `Successfully updated ${succeeded} of the selected orders.`
      );
    } else {
      setMessage(
        `Updated ${succeeded} order(s); ${failed} order(s) failed. Check the error message and refresh the list.`
      );
    }

    await load();
  }

  function exportCsv() {
    const rows = orders.filter(
      (order) =>
        selected.length === 0 || selected.includes(order.id)
    );

    const columns = [
      "order_number",
      "customer_name",
      "email",
      "mobile",
      "total",
      "payment_status",
      "fulfillment_status",
      "utr_number",
      "created_at",
    ];

    const csv = [
      columns.join(","),
      ...rows.map((order) =>
        columns
          .map((key) => {
            const value = String(
              (order as any)[key] ?? ""
            );

            return `"${value.replace(/"/g, '""')}"`;
          })
          .join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = "velfrok-orders.csv";
    anchor.click();

    URL.revokeObjectURL(url);
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f5f7fb",
        padding: 20,
        color: "#172033",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <Link
          href="/admin"
          style={{ color: "#4b5d78", fontSize: 13 }}
        >
          ← Admin dashboard
        </Link>

        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            margin: "12px 0 24px",
          }}
        >
          <div>
            <h1 style={{ margin: "0 0 5px" }}>
              Order Management
            </h1>

            <p style={{ margin: 0, color: "#68738a" }}>
              Review customer orders, verify UTRs, and advance
              fulfillment.
            </p>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={exportCsv}
              style={secondaryStyle}
            >
              Export CSV
            </button>

            <button
              onClick={load}
              disabled={loading}
              style={buttonStyle}
            >
              Refresh
            </button>
          </div>
        </header>

        <section style={panelStyle}>
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
              marginBottom: 14,
            }}
          >
            <button
              style={secondaryStyle}
              onClick={() =>
                setSelected(
                  orders
                    .filter(
                      (order) =>
                        order.payment_status ===
                        "pending_verification"
                    )
                    .map((order) => order.id)
                )
              }
            >
              Select pending UTR
            </button>

            <button
              style={secondaryStyle}
              onClick={() => setSelected([])}
            >
              Clear selection
            </button>

            <button
              style={buttonStyle}
              disabled={!selected.length}
              onClick={() => bulkPayment("accepted")}
            >
              Bulk accept
            </button>

            <button
              style={dangerStyle}
              disabled={!selected.length}
              onClick={() => bulkPayment("rejected")}
            >
              Bulk reject
            </button>

            <span
              style={{
                color: "#68738a",
                fontSize: 13,
              }}
            >
              {selected.length} selected
            </span>
          </div>

          {message && (
            <p role="status" style={{ color: "#17623b" }}>
              {message}
            </p>
          )}

          {error && (
            <p role="alert" style={{ color: "#a11" }}>
              {error}
            </p>
          )}

          {loading ? (
            <p>Loading orders…</p>
          ) : orders.length === 0 ? (
            <p>No orders found.</p>
          ) : (
            <div
              style={{
                display: "grid",
                gap: 14,
              }}
            >
              {orders.map((order) => (
                <article
                  key={order.id}
                  style={orderStyle}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <label
                      style={{
                        display: "flex",
                        gap: 9,
                        alignItems: "center",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selected.includes(order.id)}
                        onChange={(e) =>
                          setSelected((old) =>
                            e.target.checked
                              ? [...old, order.id]
                              : old.filter(
                                  (id) => id !== order.id
                                )
                          )
                        }
                      />

                      <strong>
                        {order.order_number ||
                          order.id.slice(0, 8)}
                      </strong>
                    </label>

                    <strong>
                      ₹
                      {Number(
                        order.total || 0
                      ).toLocaleString("en-IN")}
                    </strong>
                  </div>

                  <p
                    style={{
                      color: "#526176",
                      margin: "8px 0",
                    }}
                  >
                    {order.customer_name} · {order.mobile} ·{" "}
                    {order.email}
                  </p>

                  <p
                    style={{
                      color: "#526176",
                      margin: "0 0 8px",
                    }}
                  >
                    {order.street_address}, {order.city},{" "}
                    {order.state} - {order.pin_code}
                  </p>

                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      flexWrap: "wrap",
                      fontSize: 13,
                      margin: "10px 0",
                    }}
                  >
                    <span>
                      <b>Payment:</b> {order.payment_status}
                    </span>

                    <span>
                      <b>Fulfillment:</b>{" "}
                      {order.fulfillment_status}
                    </span>

                    <span>
                      <b>UTR:</b>{" "}
                      {order.utr_number || "Pending UTR"}
                    </span>

                    <span>
                      <b>Date:</b>{" "}
                      {new Date(
                        order.created_at
                      ).toLocaleString()}
                    </span>
                  </div>

                  <ul
                    style={{
                      paddingLeft: 20,
                      margin: "8px 0",
                      color: "#526176",
                      fontSize: 13,
                    }}
                  >
                    {(order.order_items || []).map(
                      (item, index) => (
                        <li key={index}>
                          {item.product_name} ({item.sku}) ×{" "}
                          {item.quantity} — ₹
                          {Number(
                            item.line_total
                          ).toLocaleString("en-IN")}
                        </li>
                      )
                    )}
                  </ul>

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      marginTop: 12,
                    }}
                  >
                    {order.payment_status ===
                      "pending_verification" && (
                      <>
                        <button
                          disabled={busyId === order.id}
                          style={buttonStyle}
                          onClick={() =>
                            update(order.id, {
                              paymentStatus: "accepted",
                            })
                          }
                        >
                          Accept payment
                        </button>

                        <button
                          disabled={busyId === order.id}
                          style={dangerStyle}
                          onClick={() =>
                            update(order.id, {
                              paymentStatus: "rejected",
                            })
                          }
                        >
                          Reject payment
                        </button>
                      </>
                    )}

                    {order.payment_status === "pending_utr" && (
                      <span
                        style={{
                          color: "#9a5a00",
                          fontSize: 12,
                        }}
                      >
                        Waiting for customer UTR submission
                      </span>
                    )}

                    {order.payment_status === "accepted" &&
                      order.fulfillment_status !== "delivered" && (
                        <button
                          disabled={busyId === order.id}
                          style={buttonStyle}
                          onClick={() =>
                            update(order.id, {
                              fulfillmentStatus:
                                order.fulfillment_status ===
                                "confirmed"
                                  ? "packed"
                                  : order.fulfillment_status ===
                                    "packed"
                                  ? "shipped"
                                  : "delivered",
                            })
                          }
                        >
                          Advance to{" "}
                          {order.fulfillment_status === "confirmed"
                            ? "packed"
                            : order.fulfillment_status === "packed"
                            ? "shipped"
                            : "delivered"}
                        </button>
                      )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

const panelStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e3e8f0",
  borderRadius: 14,
  padding: 20,
};

const orderStyle: React.CSSProperties = {
  border: "1px solid #e3e8f0",
  borderRadius: 12,
  padding: 16,
  background: "#fff",
};

const buttonStyle: React.CSSProperties = {
  padding: "9px 13px",
  border: 0,
  borderRadius: 8,
  background: "#172033",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryStyle: React.CSSProperties = {
  padding: "9px 13px",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  background: "#fff",
  cursor: "pointer",
};

const dangerStyle: React.CSSProperties = {
  ...secondaryStyle,
  color: "#a11",
  borderColor: "#e3b8b8",
};
