// Ops stats for the AppEngine owner dashboard (machine-readable, token-gated).
// Counts come from this app's own tables — numbers only, no personal data.
import crypto from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function tokenMatches(request: Request): boolean {
  const expected = (process.env.APP_ENGINE_STATS_TOKEN || "").trim();
  if (!expected) return false;
  const header = request.headers.get("authorization") || "";
  const presented = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!presented) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function serviceHeaders(): Record<string, string> | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact" };
}

function restUrl(): string {
  return `${(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "")}/rest/v1`;
}

async function countRows(path: string): Promise<number | null> {
  const headers = serviceHeaders();
  const base = restUrl();
  if (!headers || !base.startsWith("http")) return null;
  try {
    const res = await fetch(`${base}/${path}`, { headers, cache: "no-store" });
    if (!res.ok) return null;
    const range = res.headers.get("content-range") || "";
    const total = range.split("/")[1];
    if (total == null || total === "*") return null;
    const n = Number(total);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

const empty = {
  users: null as number | null,
  ticketsOpen: null as number | null,
  ordersRecent: null as number | null,
  activeUsers30d: null as number | null,
  newUsers7d: null as number | null,
  newUsersPrev7d: null as number | null
};

export async function GET(request: Request) {
  if (!tokenMatches(request)) {
    return NextResponse.json({ ok: false, message: "A valid stats token is required." }, { status: 401 });
  }
  if (!serviceHeaders() || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.json({ ok: true, reporting: false, ...empty, generatedAt: new Date().toISOString() });
  }

  const now = Date.now();
  const iso7 = new Date(now - 7 * 86400000).toISOString();
  const iso14 = new Date(now - 14 * 86400000).toISOString();
  const iso30 = new Date(now - 30 * 86400000).toISOString();

  const [users, ticketsOpen, ordersRecent, newUsers7d, newUsersPrev7d] = await Promise.all([
    countRows("swaparound_parents?select=id"),
    countRows("swaparound_reports?select=id&status=eq.open"),
    countRows(`swaparound_swap_listings?select=id&created_at=gte.${encodeURIComponent(iso30)}`),
    countRows(`swaparound_parents?select=id&created_at=gte.${encodeURIComponent(iso7)}`),
    countRows(`swaparound_parents?select=id&created_at=gte.${encodeURIComponent(iso14)}&created_at=lt.${encodeURIComponent(iso7)}`)
  ]);

  const fields = {
    users,
    ticketsOpen,
    ordersRecent,
    activeUsers30d: null as number | null,
    newUsers7d,
    newUsersPrev7d
  };
  const reporting = Object.values(fields).some((value) => value !== null);

  return NextResponse.json({
    ok: true,
    reporting,
    ...fields,
    generatedAt: new Date().toISOString()
  });
}
