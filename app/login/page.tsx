"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase";

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return "/admin";
  }
  return value;
}

function tokenClaims(token: string) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return {};
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(window.atob(padded));
  } catch {
    return {};
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"checking" | "password" | "otp">("checking");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendAdminOtp(accessToken: string) {
    const response = await fetch("/api/auth/admin-otp/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || "Could not send the admin verification code.");
    }
    setStep("otp");
    setMessage("A 6-digit security code has been sent to your administrator email address.");
  }

  useEffect(() => {
    let active = true;

    async function checkSession() {
      try {
        const supabase = supabaseBrowser();
        const url = new URL(window.location.href);
        const nextPath = safeNextPath(url.searchParams.get("next"));
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (!active) return;

        if (data.session?.access_token) {
          const claims = tokenClaims(data.session.access_token);
          if (claims.admin_email_otp_verified === true) {
            router.replace(nextPath);
            return;
          }
          await sendAdminOtp(data.session.access_token);
          return;
        }

        setStep("password");
      } catch (error) {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : "Unable to check your session.");
        setStep("password");
      }
    }

    checkSession();
    return () => { active = false; };
  }, [router]);

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      const supabase = supabaseBrowser();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error || !data.session?.access_token) {
        throw new Error("Incorrect email or password.");
      }
      await sendAdminOtp(data.session.access_token);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign-in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!/^\d{6}$/.test(otp)) {
      setMessage("Enter the 6-digit code sent to your email.");
      return;
    }

    setLoading(true);
    try {
      const supabase = supabaseBrowser();
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) throw new Error("Your sign-in session expired. Please sign in again.");

      const response = await fetch("/api/auth/admin-otp/verify", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code: otp }),
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "The code could not be verified.");

      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError || !refreshed.session?.access_token) {
        throw new Error("Verification succeeded, but the secure session could not be refreshed. Please sign in again.");
      }

      const claims = tokenClaims(refreshed.session.access_token);
      if (claims.admin_email_otp_verified !== true) {
        throw new Error("Email verification is complete, but the Supabase security hook is not enabled. Admin access remains blocked.");
      }

      const nextPath = safeNextPath(new URL(window.location.href).searchParams.get("next"));
      router.replace(nextPath);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Verification failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function resendOtp() {
    setMessage("");
    setLoading(true);
    try {
      const { data, error } = await supabaseBrowser().auth.getSession();
      if (error || !data.session?.access_token) {
        throw new Error("Your sign-in session expired. Please sign in again.");
      }
      await sendAdminOtp(data.session.access_token);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not resend the code.");
    } finally {
      setLoading(false);
    }
  }

  async function startOver() {
    await supabaseBrowser().auth.signOut();
    setPassword("");
    setOtp("");
    setMessage("");
    setStep("password");
  }

  if (step === "checking") {
    return <main style={{ padding: 40, textAlign: "center" }}>Checking your login...</main>;
  }

  return (
    <main style={{ minHeight: "70vh", display: "grid", placeItems: "center", padding: "32px 16px" }}>
      <section style={{ width: "100%", maxWidth: 420, padding: 28, border: "1px solid #e5e7eb", borderRadius: 16, background: "#fff" }}>
        <a href="/" style={{ color: "#426653", fontWeight: 700 }}>← Velfrok</a>
        <h1 style={{ marginTop: 24, marginBottom: 8 }}>Admin sign in</h1>
        <p style={{ color: "#666", lineHeight: 1.6 }}>
          {step === "otp"
            ? "Enter the 6-digit security code sent to your registered administrator email."
            : "Enter your administrator email and password to continue."}
        </p>

        {step === "password" ? (
          <form onSubmit={signIn}>
            <label htmlFor="email" style={{ display: "block", margin: "20px 0 8px" }}>Email address</label>
            <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="username" required style={fieldStyle} />
            <label htmlFor="password" style={{ display: "block", margin: "16px 0 8px" }}>Password</label>
            <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required style={fieldStyle} />
            <button type="submit" disabled={loading} style={buttonStyle}>{loading ? "Signing in..." : "Continue"}</button>
          </form>
        ) : (
          <form onSubmit={verifyOtp}>
            <label htmlFor="otp" style={{ display: "block", margin: "20px 0 8px" }}>6-digit email security code</label>
            <input id="otp" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="123456" required style={{ ...fieldStyle, fontSize: 22, letterSpacing: 8, textAlign: "center" }} />
            <button type="submit" disabled={loading || otp.length !== 6} style={buttonStyle}>{loading ? "Verifying..." : "Verify and open admin"}</button>
            <button type="button" disabled={loading} onClick={resendOtp} style={textButtonStyle}>Resend code</button>
            <button type="button" disabled={loading} onClick={startOver} style={textButtonStyle}>Sign in with another account</button>
          </form>
        )}

        {message && <p role="status" style={{ marginTop: 16, color: "#a13b2d", lineHeight: 1.6, overflowWrap: "anywhere" }}>{message}</p>}
      </section>
    </main>
  );
}

const fieldStyle: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: 13, border: "1px solid #d1d5db", borderRadius: 8, fontSize: 16 };
const buttonStyle: React.CSSProperties = { width: "100%", marginTop: 16, padding: 14, border: 0, borderRadius: 8, background: "#426653", color: "#fff", fontWeight: 700, fontSize: 16, cursor: "pointer" };
const textButtonStyle: React.CSSProperties = { width: "100%", marginTop: 12, padding: 10, border: 0, background: "transparent", color: "#426653", fontSize: 14, cursor: "pointer" };
