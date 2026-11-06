
"use client";

import { useEffect, useState } from "react";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import { supabaseBrowser } from "@/lib/supabase";

const UPI_ID = process.env.NEXT_PUBLIC_UPI_ID;
const UPI_NAME = process.env.NEXT_PUBLIC_UPI_NAME;

export default function PaymentPage({ params }) {
  const orderId = params.token;

  const [order, setOrder] = useState(null);
  const [utr, setUtr] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    let timer;

    async function checkStatus() {
      try {
        const {
          data: { session },
        } = await supabaseBrowser().auth.getSession();

        if (!session?.access_token) {
          if (active) setError("Please sign in to view this order.");
          return;
        }

        const response = await fetch(
          `/api/payment/status?orderId=${encodeURIComponent(orderId)}`,
          {
            cache: "no-store",
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          }
        );

        const result = await response.json();

        if (!active) return;

        if (!response.ok) {
          setError(result.error || "Unable to retrieve payment status.");
          return;
        }

        setOrder(result);
        setError("");
        if (result.paymentStatus === "accepted") {
          localStorage.removeItem("velfrok-cart-v1");
        }

        if (
          result.paymentStatus === "accepted" ||
          result.paymentStatus === "rejected"
        ) {
          clearInterval(timer);
        }
      } catch {
        if (active) setError("Unable to check your order. Please try again.");
      }
    }

    checkStatus();
    timer = setInterval(checkStatus, 5000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [orderId]);

  const upiLink =
    order && UPI_ID && order.paymentStatus === "pending_utr"
      ? `upi://pay?pa=${encodeURIComponent(UPI_ID)}&pn=${encodeURIComponent(
          UPI_NAME || "Velfrok"
        )}&am=${Number(order.amount).toFixed(2)}&cu=INR&tn=${encodeURIComponent(
          `Velfrok ${order.orderNumber}`
        )}`
      : null;

  async function submitUtr(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!/^[0-9]{12}$/.test(utr.trim())) {
      setError("Enter a valid 12-digit UTR number.");
      return;
    }

    if (!captcha) {
      setError("Please complete the CAPTCHA.");
      return;
    }

    setBusy(true);

    try {
      const {
        data: { session },
      } = await supabaseBrowser().auth.getSession();

      if (!session?.access_token) {
        setError("Please sign in again before submitting your UTR.");
        return;
      }

      const response = await fetch("/api/payment/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          orderId,
          utr: utr.trim(),
          captcha,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "Unable to submit your UTR.");
        return;
      }

      setMessage(result.message || "UTR submitted for verification.");
      setUtr("");
      setCaptcha("");

      const statusResponse = await fetch(
        `/api/payment/status?orderId=${encodeURIComponent(orderId)}`,
        {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      const statusResult = await statusResponse.json();

      if (statusResponse.ok) setOrder(statusResult);
    } catch {
      setError("Unable to submit your UTR. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="pay pay-container">
      <header className="pay-header"><p className="pay-eyebrow">VELFROK • SECURE CHECKOUT</p><h1>Complete your payment</h1><p>Review your order and pay securely using your UPI app.</p></header>

      {!order && !error && <p className="pay-state">Loading your order details…</p>}

      {order && (
        <>
          <p className="pay-order-number">Order <strong>{order.orderNumber}</strong></p>

          <section className="pay-card"><p className="pay-label">TOTAL TO PAY</p><h2 className="pay-amount">₹{Number(order.amount).toFixed(2)}</h2>

          {order.paymentStatus === "pending_utr" && (
            <>
              <p className="pay-instructions">Complete your UPI payment using the details below.</p>

              {upiLink && (
                <>
                  <a className="pay-app-link" href={upiLink}>Open UPI app <span aria-hidden="true">↗</span></a>

                  <p className="pay-upi-id">UPI ID <strong>{UPI_ID}</strong></p>

                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
                      upiLink
                    )}`}
                    alt="UPI payment QR code"
                    className="pay-qr"
                    width={220}
                    height={220}
                  />
                </>
              )}

              {!UPI_ID && (
                <div className="pay-config-warning" role="status"><strong>UPI setup is not complete yet</strong><span>The store owner needs to add the Velfrok UPI ID and display name before customers can pay. Do not transfer money until these details appear here.</span></div>
              )}

              {UPI_ID && (
                <div className="pay-steps" aria-label="Payment steps">
                  <p className="pay-steps-title">Three simple steps</p>
                  <ol>
                    <li><span>01</span><div><strong>Scan the QR code</strong><small>Use any UPI app on your phone.</small></div></li>
                    <li><span>02</span><div><strong>Pay the exact amount</strong><small>Make sure the amount matches this order.</small></div></li>
                    <li><span>03</span><div><strong>Submit your 12-digit UTR</strong><small>We’ll verify the payment and update your order.</small></div></li>
                  </ol>
                </div>
              )}

              {UPI_ID && <form className="pay-form" onSubmit={submitUtr}>
                <label htmlFor="utr">12-digit UTR / transaction reference</label>
                <input
                  id="utr"
                  className="pay-input"
                  inputMode="numeric"
                  maxLength={12}
                  value={utr}
                  onChange={(event) =>
                    setUtr(event.target.value.replace(/\D/g, "").slice(0, 12))
                  }
                  placeholder="Enter UTR number"
                  required
                />

                <HCaptcha
                  sitekey={process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY}
                  onVerify={setCaptcha}
                  onExpire={() => setCaptcha("")}
                  onError={() => setCaptcha("")}
                />

                <button className="pay-submit" type="submit" disabled={busy || !captcha}>
                  {busy ? "Submitting..." : "Submit UTR"}
                </button>

                <a
                  className="pay-whatsapp-link"
                  href={`https://wa.me/917718600069?text=${encodeURIComponent(
                    `Hello Velfrok, I have made a payment for Order ${order.orderNumber} (₹${Number(order.amount).toFixed(2)}). I am sharing the payment screenshot for verification.`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="pay-whatsapp-icon" aria-hidden="true">◉</span>
                  Send payment screenshot on WhatsApp
                </a>
                <p className="pay-whatsapp-note">
                  WhatsApp will open with your order details. Please attach your payment screenshot in the chat and send it.
                </p>
              </form>}

              {UPI_ID && <p className="pay-footnote">You can submit your UTR later. Your payment is not confirmed until Velfrok verifies it.</p>}
            </>
          )}

          {order.paymentStatus === "pending_verification" && (
            <p className="pay-status">UTR received. Your payment is waiting for verification.</p>
          )}

          {order.paymentStatus === "accepted" && (
            <p className="pay-status ok">
              Payment verified. Your order is confirmed.
            </p>
          )}

          {order.paymentStatus === "rejected" && (
            <p className="pay-status err">
              Payment was rejected. Please contact Velfrok support.
            </p>
          )}
        </section>
        </>
      )}

      {message && <p className="pay-status ok">{message}</p>}
      {error && <p className="pay-status err" role="alert">{error}</p>}
    </main>
  );
}
