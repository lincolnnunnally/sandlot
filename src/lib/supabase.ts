import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Browser client on the shared LPL Supabase (anon key — public by design).
// The account holder is always an adult on shared GoTrue; kids are parent-owned
// rows. RLS enforces everything server-side; this client never asserts a role.
// leftover-preview: same production LPL project as live sandlot.unitedundergod.org.
// Anon key is public by design (RLS). Preview builds often omit Production env.
const LPL_SUPABASE_URL = "https://uqhqulrqcygsmmzdzemx.supabase.co";
const LPL_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxaHF1bHJxY3lnc21temR6ZW14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExOTY1MjQsImV4cCI6MjA5Njc3MjUyNH0.vnDAP0xCLOe1oMHE6fl44M3pEhOSEM8Ri7pmNrUUAWY";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || LPL_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || LPL_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  if (!client) client = createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  return client;
}
