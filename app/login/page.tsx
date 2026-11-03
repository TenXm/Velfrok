
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase";

function safeNextPath(value: string | null) {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.startsWith("/\\")
  ) {
    return "/";
  }

  return value;
}

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;

    async function checkSession() {
      const supabase = supabaseBrowser();
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const tokenHash = url.searchParams.get("token_hash");
      const type = url.searchParams.get("type");
      const nextPath = safeNextPath(url.searchParams.get("next"));

      try {
        // Support previously issued magic links.
        if (code) {
          const { error } =
            await supabase.auth.exchangeCodeForSession(code);

          if (error) throw error;

          window.history.replaceState({}, "", "/login");
          router.replace(nextPath);
          return;
        }

        if (tokenHash && type === "email") {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: "email",
          });

          if (error) throw error;

          window.history.replaceState({}, "", "/login");
          router.replace(nextPath);
          return;
        }

        const { data, error } = await supabase.auth.getSession();

        if (error) throw error;

        if (data.session) {
          router.replace(nextPath);
          return;
        }

        if (active) setChecking(false);
      } catch (error) {
        console.error("Login check failed:", error);

        if (active) {
          setMessage(
            error instanceof Error
              ? error.message
              : "Login verification failed. Please try again."
          );
          setChecking(false);
        }
      }
    }

    checkSession();

    return () => {
      active = false;
    };
  }, [router]);

  async function sendOtp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      const supabase = supabaseBrowser();

      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
      });

      if (error) {
        setMessage(error.message);
      } else {
        setOtpSent(true);
        setMessage("A verification code has been requested. Check your email.");
      }
    } catch {
      setMessage("Unable to send the code. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!/^\d{6}$/.test(otp)) {
      setMessage("Please enter the 6-digit verification code.");
      return;
    }

    setLoading(true);

    try {
      const supabase = supabaseBrowser();

      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otp,
        type: "email",
      });

      if (error) {
        setMessage(error.message);
      } else {
        const nextPath = safeNextPath(
          new URL(window.location.href).searchParams.get("next")
        );

        router.replace(nextPath);
      }
    } catch {
      setMessage("Code verification failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <main style={{ padding: 40, textAlign: "center" }}>
        Checking your login...
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "70vh",
        display: "grid",
        placeItems: "center",
        padding: "32px 16px",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: 420,
          padding: 28,
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          background: "#fff",
        }}
      >
        <a href="/" style={{ color: "#426653", fontWeight: 700 }}>
          ← Velfrok
        </a>

        <h1 style={{ marginTop: 24, marginBottom: 8 }}>
          Welcome back
        </h1>

        <p style={{ color: "#666", lineHeight: 1.6 }}>
          {otpSent
            ? "Enter the 6-digit verification code sent to your email."
            : "Enter your email and we'll send you a verification code."}
        </p>

        {!otpSent ? (
          <form onSubmit={sendOtp}>
            <label
              htmlFor="email"
              style={{ display: "block", margin: "20px 0 8px" }}
            >
              Email address
            </label>

            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: 13,
                border: "1px solid #d1d5db",
                borderRadius: 8,
                fontSize: 16,
              }}
            />

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                marginTop: 16,
                padding: 14,
                border: 0,
                borderRadius: 8,
                background: "#426653",
                color: "#fff",
                fontWeight: 700,
                fontSize: 16,
              }}
            >
              {loading ? "Sending code..." : "Send verification code"}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyOtp}>
            <label
              htmlFor="otp"
              style={{ display: "block", margin: "20px 0 8px" }}
            >
              6-digit verification code
            </label>

            <input
              id="otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={otp}
              onChange={(event) =>
                setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="123456"
              required
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: 13,
                border: "1px solid #d1d5db",
                borderRadius: 8,
                fontSize: 22,
                letterSpacing: 8,
                textAlign: "center",
              }}
            />

            <button
              type="submit"
              disabled={loading || otp.length !== 6}
              style={{
                width: "100%",
                marginTop: 16,
                padding: 14,
                border: 0,
                borderRadius: 8,
                background: "#426653",
                color: "#fff",
                fontWeight: 700,
                fontSize: 16,
              }}
            >
              {loading ? "Verifying..." : "Verify code"}
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setOtpSent(false);
                setOtp("");
                setMessage("");
              }}
              style={{
                width: "100%",
                marginTop: 12,
                padding: 10,
                border: 0,
                background: "transparent",
                color: "#426653",
                fontSize: 14,
              }}
            >
              Change email address
            </button>
          </form>
        )}

        {message && (
          <p
            role="status"
            style={{
              marginTop: 16,
              color: "#426653",
              lineHeight: 1.6,
              overflowWrap: "anywhere",
            }}
          >
            {message}
          </p>
        )}
      </section>
    </main>
  );
}
