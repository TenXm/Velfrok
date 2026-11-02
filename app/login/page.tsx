
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;

    async function handleCallback() {
      const supabase = supabaseBrowser();
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const tokenHash = url.searchParams.get("token_hash");
      const type = url.searchParams.get("type");

      try {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);

          if (error) throw error;

          window.history.replaceState({}, "", "/login");
          router.replace("/");
          return;
        }

        if (tokenHash && type === "email") {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: "email",
          });

          if (error) throw error;

          window.history.replaceState({}, "", "/login");
          router.replace("/");
          return;
        }

        const { data, error } = await supabase.auth.getSession();

        if (error) throw error;

        if (data.session) {
          router.replace("/");
          return;
        }

        if (active) {
          setChecking(false);
        }
      } catch (error) {
        console.error("Login callback failed:", error);

        if (active) {
          setMessage(
            error instanceof Error
              ? error.message
              : "Verification failed. Please request a new login link."
          );
          setChecking(false);
        }
      }
    }

    handleCallback();

    return () => {
      active = false;
    };
  }, [router]);

  async function sendLoginLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      const supabase = supabaseBrowser();

      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
        },
      });

      if (error) {
        setMessage(error.message);
      } else {
        setMessage(
          "Check your email for your secure sign-in link."
        );
      }
    } catch {
      setMessage("Unable to start login. Please try again.");
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
          Enter your email and we’ll send you a secure sign-in link.
        </p>

        <form onSubmit={sendLoginLink}>
          <label htmlFor="email" style={{ display: "block", margin: "20px 0 8px" }}>
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
            {loading ? "Sending link..." : "Send sign-in link"}
          </button>
        </form>

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
