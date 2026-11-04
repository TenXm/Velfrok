import { createClient } from "@supabase/supabase-js";

export const supabaseAdminBrowser = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || !anon) throw new Error("Supabase public environment variables are missing.");

  return createClient(url, anon, {
    auth: {
      storageKey: "velfrok-admin-auth",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
};
