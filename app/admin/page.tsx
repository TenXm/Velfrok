"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseAdminBrowser } from "@/lib/supabase-admin-browser";
import AdminWorkspace from "@/components/admin-workspace";

export default function AdminPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [orders, setOrders] = useState<any[]>([]);
  const [email, setEmail] = useState("Admin");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function start() {
      const supabase = supabaseAdminBrowser();
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) { router.replace("/admin/login"); return; }
      const response = await fetch("/api/admin/orders", { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) { router.replace("/admin/login"); return; }
      if (!response.ok) throw new Error(result.error || "Could not load Admin.");
      if (!alive) return;
      setToken(accessToken);
      setEmail(data.session?.user.email || "Admin");
      setOrders(Array.isArray(result.orders) ? result.orders : []);
      setLoading(false);
    }
    start().catch(e => { if (alive) { setError(e.message || "Unable to load Admin."); setLoading(false); } });
    return () => { alive = false; };
  }, [router]);

  async function signOut() {
    await supabaseAdminBrowser().auth.signOut();
    router.replace("/admin/login");
  }

  return <main style={{ minHeight: "100vh", padding: 24, background: "#f5f2e9", color: "#20372b" }}>
    <header style={{ maxWidth: 1200, margin: "0 auto 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div><strong style={{ fontSize: 24 }}>velfrok</strong><div>ADMIN WORKSPACE</div></div>
      <div>{email} <button onClick={signOut}>Sign out</button></div>
    </header>
    <section style={{ maxWidth: 1200, margin: "auto" }}>
      {loading ? <p>Checking secure Admin access...</p> : error ? <p>{error}</p> : <AdminWorkspace accessToken={token} initialOrders={orders} />}
    </section>
  </main>;
}
