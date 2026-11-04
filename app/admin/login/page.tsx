"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase";

function readClaims(token: string) {
  try { return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); }
  catch { return {}; }
}

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"password" | "otp">("password");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const supabase = useMemo(() => supabaseBrowser(), []);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token && readClaims(token).admin_email_otp_verified === true) {
        const response = await fetch("/api/admin/orders", {
          headers: { Authorization: `Bearer ${token}` }, cache: "no-store"
        });
        if (response.ok && active) router.replace("/admin");
      }
    })();
    return () => { active = false; };
  }, [router, supabase]);

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail, password
      });
      if (error || !data.session) {
        setMessage("Email address or password is incorrect.");
        return;
      }
      const response = await fetch("/api/admin/auth/send-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session.access_token}`
        },
        body: JSON.stringify({ email: normalizedEmail }),
        cache: "no-store"
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(result.error || "Could not send the verification code.");
        return;
      }
      setStep("otp");
      setMessage("A 6-digit verification code has been sent to your registered email.");
    } catch {
      setMessage("Unable to sign in right now. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setMessage("Enter the 6-digit code sent to your email.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setStep("password");
        setMessage("Your sign-in session expired. Please sign in again.");
        return;
      }
      const response = await fetch("/api/admin/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code }), cache: "no-store"
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(result.error || "The verification code could not be confirmed.");
        return;
      }
      const { data: refreshed, error } = await supabase.auth.refreshSession();
      if (error || !refreshed.session) throw new Error("Could not refresh the verified session.");
      if (readClaims(refreshed.session.access_token).admin_email_otp_verified !== true) {
        throw new Error("Email verification was saved, but the secure session has not refreshed. Please try again.");
      }
      const check = await fetch("/api/admin/orders", {
        headers: { Authorization: `Bearer ${refreshed.session.access_token}` }, cache: "no-store"
      });
      if (!check.ok) throw new Error("Admin access could not be confirmed. Please contact the site administrator.");
      router.replace("/admin");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Verification failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function restart() {
    await supabase.auth.signOut();
    setPassword("");
    setCode("");
    setStep("password");
    setMessage("");
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20, background: "#f5f2e9", color: "#20372b" }}>
      <section style={{ width: "100%", maxWidth: 430, padding: 30, border: "1px solid #dce3d8", borderRadius: 18, background: "#fffdf7", boxShadow: "0 16px 45px rgba(32,55,43,.08)" }}>
        <a href="/" style={{ color: "#426653", fontWeight: 800, textDecoration: "none" }}>← Velfrok</a>
        <p style={{ margin: "28px 0 6px", color: "#66816d", fontSize: 11, letterSpacing: 3, fontWeight: 800 }}>SECURE BACK OFFICE</p>
        <h1 style={{ margin: "0 0 10px", fontSize: 27 }}>Admin sign in</h1>
        <p style={{ color: "#66736a", lineHeight: 1.6, fontSize: 14 }}>
          {step === "password" ? "Sign in with your registered administrator email and password. We will then send a one-time code to that email." : `Enter the 6-digit code sent to ${email.trim().toLowerCase()}.`}
        </p>
        {step === "password" ? (
          <form onSubmit={submitPassword}>
            <label style={{ display: "block", margin: "20px 0 7px", fontSize: 13, fontWeight: 700 }}>Registered email</label>
            <input type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: 13, border: "1px solid #ccd8cd", borderRadius: 9, background: "#fff", fontSize: 16 }} />
            <label style={{ display: "block", margin: "16px 0 7px", fontSize: 13, fontWeight: 700 }}>Password</label>
            <input type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: 13, border: "1px solid #ccd8cd", borderRadius: 9, background: "#fff", fontSize: 16 }} />
            <button disabled={loading} style={{ width: "100%", marginTop: 20, padding: 14, border: 0, borderRadius: 9, background: "#426653", color: "white", fontWeight: 800, cursor: "pointer" }}>{loading ? "Checking..." : "Continue securely"}</button>
          </form>
        ) : (
          <form onSubmit={submitCode}>
            <label style={{ display: "block", margin: "20px 0 7px", fontSize: 13, fontWeight: 700 }}>Email verification code</label>
            <input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" style={{ width: "100%", boxSizing: "border-box", padding: 15, border: "1px solid #ccd8cd", borderRadius: 9, fontSize: 24, letterSpacing: 9, textAlign: "center" }} />
            <button disabled={loading || code.length !== 6} style={{ width: "100%", marginTop: 16, padding: 14, border: 0, borderRadius: 9, background: "#426653", color: "white", fontWeight: 800, cursor: "pointer" }}>{loading ? "Verifying..." : "Verify and open dashboard"}</button>
            <button type="button" disabled={loading} onClick={restart} style={{ width: "100%", marginTop: 10, padding: 11, border: 0, background: "transparent", color: "#426653", fontWeight: 700 }}>Back to sign in</button>
          </form>
        )}
        {message && <p role="status" style={{ marginTop: 18, color: "#426653", fontSize: 13, lineHeight: 1.6 }}>{message}</p>}
        <p style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid #e5e9df", color: "#7b857b", fontSize: 12, lineHeight: 1.6 }}>Admin access is restricted to accounts explicitly authorized by the Velfrok administrator.</p>
      </section>
    </main>
  );
}
