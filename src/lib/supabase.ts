import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Browser client on the shared LPL Supabase (anon key — public by design).
// The account holder is always an adult on shared GoTrue; kids are parent-owned
// rows. RLS enforces everything server-side; this client never asserts a role.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  if (!client) client = createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  return client;
}
