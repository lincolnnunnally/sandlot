-- Sandlot 0008 — lock down swaparound_signup_rate_check to service role only
--
-- Fixes a MEDIUM finding from the 2026-07-22 child-safety review.
--
-- 0007 secured this SECURITY DEFINER function with only:
--     REVOKE ALL ON FUNCTION ... FROM PUBLIC;
-- On a standard Supabase project that is INSUFFICIENT. Supabase ships
-- `ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE ON FUNCTIONS TO anon, authenticated`
-- so every function created in `public` gets a *direct* EXECUTE grant to the
-- anon and authenticated roles. `REVOKE ... FROM PUBLIC` only strips the implicit
-- PUBLIC grant — it does NOT touch those direct role grants. So any anonymous
-- client could call the RPC directly at
--     POST /rest/v1/rpc/swaparound_signup_rate_check
-- and, per call, insert into swaparound_signup_attempts and rate-limit a victim's
-- email out of signing up (email hashed with a known algorithm) plus flood the
-- attempts ledger.
--
-- Fix: explicitly REVOKE EXECUTE from anon and authenticated. The signup API
-- route (src/app/api/signup/route.ts) calls this RPC with the service-role key,
-- which maps to the service_role Postgres role and bypasses RLS — service_role
-- MUST retain EXECUTE, so we do not touch it.
--
-- Apply on LPL Supabase after 0007. Safe to re-run (idempotent — REVOKE of an
-- already-absent grant is a no-op).

-- The function has a single (text, text) signature. Belt-and-suspenders: also
-- revoke from PUBLIC again in case an intervening CREATE OR REPLACE re-granted it.
REVOKE ALL ON FUNCTION public.swaparound_signup_rate_check(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.swaparound_signup_rate_check(text, text) FROM anon, authenticated;

-- Guarantee the intended caller keeps access even if defaults ever change.
GRANT EXECUTE ON FUNCTION public.swaparound_signup_rate_check(text, text) TO service_role;

COMMENT ON FUNCTION public.swaparound_signup_rate_check(text, text) IS
  'Signup rate limiter (hashed email/IP). SECURITY DEFINER; EXECUTE granted to '
  'service_role ONLY — called from the server signup route with the service-role '
  'key. anon/authenticated are explicitly revoked (see migration 0008).';
