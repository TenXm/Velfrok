
"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";

type Order = {
  id: string;
  created_at?: string;
  status?: string;
  payment_status?: string;
};

type Step =
  | "checking"
  | "signed-out"
  | "unauthorized"
  | "enroll"
  | "challenge"
  | "ready"
  | "error";

export default function AdminPage() {
  const [step, setStep] = useState<Step>("checking");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [factorId, setFactorId] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const supabase = supabaseBrowser();

  const loadOrders = useCallback(async () => {
    const { data, error } = await supabase.auth.getSession();

    if (error) throw error;

    const session = data.session;

    if (!session?.access_token) {
      setStep("signed-out");
      return;
    }

    const response = await fetch("/api/admin/orders", {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      cache: "no-store",
    });

    const result = await response.json().catch(() => ({}));

    if (response.status === 401 || response.status === 403) {
      setStep("unauthorized");
      setMessage(result.error || "Admin authorization or MFA is required.");
      return;
    }

    if (!response.ok) {
      throw new Error(result.error || "Could not load orders.");
    }

    setOrders(Array.isArray(result.orders) ? result.orders : []);
    setEmail(session.user.email || "Admin");
    setStep("ready");
  }, []);

  const createChallenge = async (id: string) => {
    const { data, error } = await supabase.auth.mfa.challenge({
      factorId: id,
    });

    if (error) throw error;

    setFactorId(id);
    setChallengeId(data.id);
    setCode("");
    setStep("challenge");
  };

  const beginEnrollment = async () => {
    const { data: factors, error: listError } =
      await supabase.auth.mfa.listFactors();

    if (listError) throw listError;

    const pending = factors.totp.find(
      (factor) => factor.status === "unverified"
    );

    if (pending) {
      const { error } = await supabase.auth.mfa.unenroll({
        factorId: pending.id,
      });

      if (error) throw error;
    }

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Velfrok Admin Authenticator",
    });

    if (error) throw error;

    setFactorId(data.id);
    setQrCode(data.totp.qr_code);
    setSecret(data.totp.secret);
    setCode("");
    setStep("enroll");
  };

  const initialize = useCallback(async () => {
    try {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      if (!sessionData.session) {
        setStep("signed-out");
        return;
      }

      const { data: userData, error: userError } =
        await supabase.auth.getUser();

      if (userError || !userData.user) {
        setStep("signed-out");
        return;
      }

      setEmail(userData.user.email || "Admin");

      // Check admin membership through the user's own RLS-protected row.
      const { data: admin, error: adminError } = await supabase
        .from("velfrok_admins")
        .select("user_id")
        .eq("user_id", userData.user.id)
        .maybeSingle();

      if (adminError) throw adminError;

      if (!admin) {
        setStep("unauthorized");
        setMessage("This account is not authorized as an administrator.");
        return;
      }

      const { data: factors, error: factorError } =
        await supabase.auth.mfa.listFactors();

      if (factorError) throw factorError;

      const verifiedFactor = factors.totp.find(
        (factor) => factor.status === "verified"
      );

      if (!verifiedFactor) {
        await beginEnrollment();
        return;
      }

      const { data: assurance, error: assuranceError } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

      if (assuranceError) throw assuranceError;

      if (assurance.currentLevel === "aal2") {
        await loadOrders();
      } else {
        await createChallenge(verifiedFactor.id);
      }
    } catch (error) {
      console.error("Admin initialization failed:", error);
      setMessage(
        error instanceof Error ? error.message : "Unable to initialize admin."
      );
      setStep("error");
    }
  }, [loadOrders]);

  useEffect(() => {
    initialize();
  }, [initialize]);

  async function verifyCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!/^\d{6}$/.test(code)) {
      setMessage("Enter the 6-digit authenticator code.");
      return;
    }

    setLoading(true);

    try {
      let currentChallengeId = challengeId;

      // Enrollment must be challenged before it can be verified.
      if (step === "enroll") {
        const { data, error } = await supabase.auth.mfa.challenge({
          factorId,
        });

        if (error) throw error;

        currentChallengeId = data.id;
      }

      const { error } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: currentChallengeId,
        code,
      });

      if (error) throw error;

      setQrCode("");
      setSecret("");
      setCode("");
      setMessage("MFA verified. Opening your dashboard...");

      await loadOrders();
    } catch (error) {
      console.error("MFA verification failed:", error);
      setMessage(
        error instanceof Error
          ? error.message
          : "Verification failed. Check the code and try again."
      );
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setOrders([]);
    setEmail("");
    setStep("signed-out");
  }

  async function refreshOrders() {
    setLoading(true);
    setMessage("");

    try {
      await loadOrders();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not refresh orders."
      );
      setStep("error");
    } finally {
      setLoading(false);
    }
  }

  const total = orders.length;
  const pending = orders.filter(
    (order) => order.payment_status === "pending"
  ).length;
  const paid = orders.filter(
    (order) => order.payment_status === "paid"
  ).length;
  const active = orders.filter((order) =>
    ["placed", "packed", "dispatched"].includes(order.status || "")
  ).length;

  const styles = `
    * { box-sizing: border-box; }
    body { margin: 0; background: #080a12; }
    .page {
      min-height: 100vh;
      padding: 25px 16px;
      color: #f3f4fa;
      background: radial-gradient(ellipse at top right, #29204a, #080a12 55%);
      font-family: Arial, sans-serif;
    }
    .container { width: 100%; max-width: 1050px; margin: auto; }
    .top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 0 24px;
      border-bottom: 1px solid #292b3b;
    }
    .brand { font-size: 23px; font-weight: 800; }
    .brand small {
      display: block;
      margin-top: 4px;
      color: #9b91c8;
      font-size: 9px;
      letter-spacing: 3px;
    }
    .panel {
      width: 100%;
      max-width: 480px;
      margin: 65px auto;
      padding: 30px;
      border: 1px solid #343147;
      border-radius: 18px;
      background: rgba(19, 19, 32, .96);
      text-align: center;
    }
    h1 { font-size: 25px; margin: 0 0 12px; }
    h2 { font-size: 19px; }
    p { color: #a5a6b8; font-size: 14px; line-height: 1.7; }
    .input {
      width: 100%;
      padding: 15px;
      margin: 12px 0;
      border: 1px solid #45415b;
      border-radius: 10px;
      outline: none;
      background: #10111e;
      color: white;
      font-size: 22px;
      letter-spacing: 8px;
      text-align: center;
    }
    .button {
      width: 100%;
      padding: 14px;
      margin-top: 12px;
      border: 0;
      border-radius: 10px;
      background: #8466df;
      color: white;
      font-weight: 700;
      font-size: 14px;
      cursor: pointer;
    }
    .button:disabled { opacity: .5; cursor: wait; }
    .secondary {
      padding: 11px 15px;
      border: 1px solid #48445e;
      border-radius: 9px;
      background: transparent;
      color: #ddd5ff;
      cursor: pointer;
    }
    .qr {
      display: block;
      width: 210px;
      max-width: 100%;
      height: auto;
      margin: 20px auto;
      padding: 10px;
      border-radius: 10px;
      background: white;
    }
    .secret {
      display: block;
      overflow-wrap: anywhere;
      padding: 12px;
      border: 1px solid #48445e;
      border-radius: 9px;
      background: #10111e;
      color: #c7b9ff;
      font-size: 13px;
      user-select: all;
    }
    .message { color: #f2c779; overflow-wrap: anywhere; }
    .stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 14px;
      margin: 30px 0;
    }
    .stat {
      padding: 20px;
      border: 1px solid #343147;
      border-radius: 13px;
      background: #141522;
    }
    .stat strong { display: block; margin: 8px 0; font-size: 30px; }
    .stat span { color: #a5a6b8; font-size: 12px; }
    .orders {
      padding: 22px;
      border: 1px solid #343147;
      border-radius: 14px;
      background: #141522;
    }
    .order {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 15px 0;
      border-bottom: 1px solid #292b3b;
      font-size: 13px;
    }
    .muted { color: #999bb0; font-size: 12px; }
    .actions { display: flex; gap: 10px; }
    @media(max-width:650px) {
      .stats { grid-template-columns: repeat(2, 1fr); gap: 9px; }
      .stat { padding: 14px; }
      .stat strong { font-size: 24px; }
      .panel { margin: 35px auto; padding: 22px; }
      .order { flex-wrap: wrap; }
    }
  `;

  return (
    <main className="page">
      <style>{styles}</style>

      <div className="container">
        <header className="top">
          <div className="brand">
            velfrok
            <small>BETTER LIVING</small>
          </div>

          {step === "ready" && (
            <div className="actions">
              <button className="secondary" onClick={refreshOrders}>
                Refresh
              </button>
              <button className="secondary" onClick={signOut}>
                Sign out
              </button>
            </div>
          )}
        </header>

        {step === "checking" && (
          <section className="panel">
            <h1>Checking secure access</h1>
            <p>Please wait while we verify your administrator account.</p>
          </section>
        )}

        {step === "signed-out" && (
          <section className="panel">
            <h1>Sign in to Velfrok</h1>
            <p>You must sign in before accessing the Admin Dashboard.</p>
            <a className="button" href="/login" style={{ display: "block", textDecoration: "none" }}>
              Sign in
            </a>
          </section>
        )}

        {step === "unauthorized" && (
          <section className="panel">
            <h1>Admin access required</h1>
            <p>{message || "This account is not an authorized administrator."}</p>
            <button className="button" onClick={signOut}>
              Sign out
            </button>
          </section>
        )}

        {step === "enroll" && (
          <section className="panel">
            <h1>Set up Admin MFA</h1>
            <p>
              Install Google Authenticator, Microsoft Authenticator or another
              compatible authenticator app. Scan this QR code.
            </p>

            {qrCode && (
              <img className="qr" src={qrCode} alt="Authenticator QR code" />
            )}

            <p>If you cannot scan the QR code, enter this setup key manually:</p>
            <code className="secret">{secret}</code>

            <form onSubmit={verifyCode}>
              <p>Enter the current 6-digit code from your authenticator app.</p>
              <input
                className="input"
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                maxLength={6}
                required
              />
              <button
                className="button"
                disabled={loading || code.length !== 6}
              >
                {loading ? "Verifying..." : "Verify and activate MFA"}
              </button>
            </form>

            {message && <p className="message">{message}</p>}
          </section>
        )}

        {step === "challenge" && (
          <section className="panel">
            <h1>Admin verification</h1>
            <p>
              Open your authenticator app and enter the current 6-digit
              Velfrok code.
            </p>

            <form onSubmit={verifyCode}>
              <input
                className="input"
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                maxLength={6}
                required
              />

              <button
                className="button"
                disabled={loading || code.length !== 6}
              >
                {loading ? "Verifying..." : "Verify and continue"}
              </button>
            </form>

            {message && <p className="message">{message}</p>}
          </section>
        )}

        {step === "error" && (
          <section className="panel">
            <h1>Something went wrong</h1>
            <p className="message">{message}</p>
            <button className="button" onClick={initialize}>
              Try again
            </button>
            <button className="secondary" onClick={signOut}>
              Sign out
            </button>
          </section>
        )}

        {step === "ready" && (
          <>
            <section style={{ marginTop: 35 }}>
              <p>ADMIN WORKSPACE / OVERVIEW</p>
              <h1>Welcome back, {email}</h1>
              <p>Your Velfrok store dashboard is ready.</p>
            </section>

            <section className="stats">
              <div className="stat">
                <span>Total orders</span>
                <strong>{total}</strong>
              </div>
              <div className="stat">
                <span>Pending payments</span>
                <strong>{pending}</strong>
              </div>
              <div className="stat">
                <span>Paid orders</span>
                <strong>{paid}</strong>
              </div>
              <div className="stat">
                <span>Active orders</span>
                <strong>{active}</strong>
              </div>
            </section>

            <section className="orders">
              <h2>Recent orders</h2>

              {orders.length === 0 ? (
                <p>No customer orders yet.</p>
              ) : (
                orders.slice(0, 20).map((order) => (
                  <div className="order" key={order.id}>
                    <strong>
                      Order #{order.id.slice(0, 8).toUpperCase()}
                    </strong>
                    <span className="muted">
                      {order.status || "Unknown"} /{" "}
                      {order.payment_status || "Unknown"}
                    </span>
                  </div>
                ))
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
                      }
