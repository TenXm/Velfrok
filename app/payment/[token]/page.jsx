"use client";

import { useEffect, useState } from "react";
import HCaptcha from "@hcaptcha/react-hcaptcha";

const UPI_ID = process.env.NEXT_PUBLIC_UPI_ID;
const NAME = process.env.NEXT_PUBLIC_UPI_NAME;

export default function PaymentPage({ params }) {
  const token = params.token;

  const [status, setStatus] = useState("loading");
  const [amount, setAmount] = useState(null);
  const [utr, setUtr] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [secs, setSecs] = useState(1200);

  // Countdown timer.
  useEffect(() => {
    if (secs <= 0 || status === "paid" || status === "expired") {
      return;
    }

    const timer = setTimeout(() => {
      setSecs((current) => Math.max(0, current - 1));
    }, 1000);

    return () => clearTimeout(timer);
  }, [secs, status]);

  // Fetch payment status and amount from the server.
  useEffect(() => {
    let active = true;
    let interval;

    async function checkStatus() {
      try {
        const response = await fetch(
          `/api/payment/status?token=${encodeURIComponent(token)}`,
          { cache: "no-store" }
        );

        const result = await response.json();

        if (!active) return;

        if (!response.ok) {
          setErr(result.error || "Unable to check payment status.");
          return;
        }

        setStatus(result.status);

        if (Number.isFinite(Number(result.amount))) {
          setAmount(Number(result.amount));
        }

        if (result.status === "paid") {
          setMsg("Payment confirmed!");
        }

        if (
          result.status === "paid" ||
          result.status === "expired" ||
          result.status === "not_found"
        ) {
          clearInterval(interval);
        }
      } catch {
        if (active) {
          setErr("Could not check payment status. Please try again.");
        }
      }
    }

    checkStatus();
    interval = setInterval(checkStatus, 3000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [token]);

  const upiLink =
    amount !== null && UPI_ID
      ? `upi://pay?pa=${encodeURIComponent(UPI_ID)}&pn=${encodeURIComponent(
          NAME || "Velfrok"
        )}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(
          `Velfrok ${token.slice(0, 8)}`
        )}`
      : null;

  async function submitUtr(event) {
    event.preventDefault();
    setErr("");
    setMsg("");

    if (!utr.trim() || !captcha) {
      setErr("Enter your UTR and complete the captcha.");
      return;
    }

    try {
      const { supabaseBrowser } = await import("@/lib/supabase");
      const {
        data: { session },
      } = await supabaseBrowser().auth.getSession();

      if (!session?.access_token) {
        setErr("Please sign in again before submitting your UTR.");
        return;
      }

      const response = await fetch("/api/payment/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          token,
          utr: utr.trim(),
          captcha,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setErr(result.error || "Unable to submit UTR.");
        return;
      }

      setMsg(result.message || "UTR submitted for verification.");
      setStatus("utr_submitted");
    } catch {
      setErr("Unable to submit your UTR. Please try again.");
    }
  }

  const isExpired = status === "expired" || secs <= 0;

  return (
    <main className="pay">
      <h1>
        {amount === null ? "Loading payment…" : `Pay ₹${amount.toFixed(2)}`}
      </h1>

      {status === "loading" && <p>Checking payment details…</p>}

      {status !== "paid" && !isExpired && (
        <p>
          ⏱ Payment page expires in {Math.floor(secs / 60)}:
          {String(secs % 60).padStart(2, "0")}
        </p>
      )}

      {isExpired && (
        <p className="err">
          Payment page expired — please place the order again.
        </p>
      )}

      {upiLink && status === "opened" && !isExpired && (
        <>
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
              upiLink
            )}`}
            alt="UPI payment QR code"
            width={220}
            height={220}
          />

          <p>
            Or pay to UPI ID: <strong>{UPI_ID}</strong>
          </p>

          <p className="note">
            Reference code:{" "}
            <strong>{token.slice(0, 8).toUpperCase()}</strong>
          </p>
        </>
      )}

      {status === "utr_submitted" && (
        <div className="ok">✅ Received! Verifying shortly…</div>
      )}

      {status === "paid" && (
        <div className="ok big">
          🎉 Payment confirmed — your order is being packed!
        </div>
      )}

      {status === "opened" && !isExpired && (
        <form onSubmit={submitUtr}>
          <input
            value={utr}
            onChange={(event) => setUtr(event.target.value)}
            placeholder="Enter UPI Transaction ID (UTR)"
            required
          />

          <HCaptcha
            sitekey={process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY}
            onVerify={setCaptcha}
            onExpire={() => setCaptcha("")}
            onError={() => setCaptcha("")}
          />

          <button type="submit" disabled={!captcha || !utr.trim()}>
            I have paid — Submit UTR
          </button>
        </form>
      )}

      {msg && <p className="ok">{msg}</p>}
      {err && <p className="err" role="alert">{err}</p>}
    </main>
  );
}
