
"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { UserRound } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase";

export default function AuthStatus() {
  const pathname = usePathname();
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = supabaseBrowser();

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!error) {
          setLoggedIn(Boolean(data.session));
        }
      })
      .catch(() => {
        setLoggedIn(false);
      })
      .finally(() => {
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setLoggedIn(Boolean(session));
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleClick() {
    if (busy || loading) return;

    if (!loggedIn) {
      window.location.assign(`/login?next=${encodeURIComponent(pathname || "/")}`);
      return;
    }

    setBusy(true);

    try {
      const supabase = supabaseBrowser();
      const { error } = await supabase.auth.signOut();

      if (error) {
        alert("Logout failed. Please try again.");
        return;
      }

      setLoggedIn(false);
    } catch {
      alert("Unable to log out. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className="header-action"
      onClick={handleClick}
      disabled={loading || busy}
      aria-label={loggedIn ? "Logout" : "Login"}
    >
      <UserRound size={20} />
      {loading ? "Loading..." : busy ? "Please wait..." : loggedIn ? "Logout" : "Login"}
    </button>
  );
}
