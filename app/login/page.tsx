"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = supabaseBrowser();

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace("/");
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        router.replace("/");
      }
    });

    return () => subscription.unsubscribe();
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
          "Check your email for the secure sign-in link. You can return here after opening it."
        );
      }
    } catch {
      setMessage("Unable to start login. Please try again.");
    } finally {
      setLoading(false);
    }
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
        <a
          href="/"
          style={{
            color: "#426653",
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          ← Velfrok
        </a>

        <h1 style={{ marginTop: 24, marginBottom: 8 }}>
          Welcome back
        </h1>

        <p style={{ color: "#666", lineHeight: 1.6 }}>
          Enter your email and we’ll send you a secure sign-in link.
        </p>

        <form onSubmit={sendLoginLink}>
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
              cursor: loading ? "wait" : "pointer",
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

        <p style={{ marginTop: 20, fontSize: 13, color: "#777" }}>
          Your login session can remain active when you return to Velfrok.
          Use Logout when you want to end it.
        </p>
      </section>
    </main>
  );
}
