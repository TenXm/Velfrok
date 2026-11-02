
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
    <main className="pay">
      <h1>Velfrok Payment</h1>

      {!order && !error && <p>Loading order details...</p>}

      {order && (
        <>
          <p>
            Order: <strong>{order.orderNumber}</strong>
          </p>

          <h2>Amount: ₹{Number(order.amount).toFixed(2)}</h2>

          {order.paymentStatus === "pending_utr" && (
            <>
              <p>Complete your UPI payment using the details below.</p>

              {upiLink && (
                <>
                  <a href={upiLink}>
                    <button type="button">Pay with UPI app</button>
                  </a>

                  <p>
                    UPI ID: <strong>{UPI_ID}</strong>
                  </p>

                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
                      upiLink
                    )}`}
                    alt="UPI payment QR code"
                    width={220}
                    height={220}
                  />
                </>
              )}

              {!UPI_ID && (
                <p>UPI payment details are not configured yet.</p>
              )}

              <form onSubmit={submitUtr}>
                <label htmlFor="utr">12-digit UTR number</label>
                <input
                  id="utr"
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

                <button type="submit" disabled={busy || !captcha}>
                  {busy ? "Submitting..." : "Submit UTR"}
                </button>
              </form>

              <p>
                You can submit your UTR later. Your payment is not confirmed
                until Velfrok verifies it.
              </p>
            </>
          )}

          {order.paymentStatus === "pending_verification" && (
            <p>UTR received. Your payment is waiting for verification.</p>
          )}

          {order.paymentStatus === "accepted" && (
            <p className="ok">
              Payment verified. Your order is confirmed.
            </p>
          )}

          {order.paymentStatus === "rejected" && (
            <p className="err">
              Payment was rejected. Please contact Velfrok support.
            </p>
          )}
        </>
      )}

      {message && <p className="ok">{message}</p>}
      {error && <p className="err" role="alert">{error}</p>}
    </main>
  );
}
