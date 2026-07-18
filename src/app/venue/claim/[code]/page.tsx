"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { claimVenueInvite, peekVenueInvite, VENUE_TYPES } from "@/lib/db";

export default function VenueClaimPage() {
  const params = useParams<{ code: string }>();
  const code = decodeURIComponent((params?.code ?? "").toString()).trim();
  const router = useRouter();
  const supa = getSupabase();

  const [peek, setPeek] = useState<Record<string, unknown> | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [authMode, setAuthMode] = useState<"in" | "up">("up");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [f, setF] = useState({
    name: "", neighborhood: "", address: "", contactName: "", contactEmail: "",
    contactPhone: "", description: "", hoursNote: "", perk: "", servicesDiscount: "",
  });

  useEffect(() => {
    peekVenueInvite(code)
      .then((p) => {
        setPeek(p);
        if (p && p.status === "pending") {
          setF((cur) => ({
            ...cur,
            name: String(p.org_name || ""),
            neighborhood: String(p.neighborhood || ""),
            contactName: String(p.contact_name || ""),
            contactEmail: String(p.contact_email || ""),
          }));
          if (p.contact_email) setEmail(String(p.contact_email));
        }
      })
      .catch(() => setPeek(null));
  }, [code]);

  useEffect(() => {
    if (!supa) { setReady(true); return; }
    supa.auth.getSession().then(({ data }) => {
      setUid(data.session?.user.id ?? null);
      setReady(true);
    });
    const { data: sub } = supa.auth.onAuthStateChange((_e, s) => setUid(s?.user.id ?? null));
    return () => sub.subscription.unsubscribe();
  }, [supa]);

  async function auth(e: React.FormEvent) {
    e.preventDefault();
    if (!supa) return;
    setErr(""); setBusy(true);
    try {
      if (authMode === "up") {
        const { error } = await supa.auth.signUp({ email, password });
        if (error) throw error;
        const { error: e2 } = await supa.auth.signInWithPassword({ email, password });
        if (e2) throw e2;
      } else {
        const { error } = await supa.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Auth failed.");
    } finally {
      setBusy(false);
    }
  }

  const claim = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      await claimVenueInvite(code, f);
      router.push("/venue");
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Couldn't claim invite.");
    } finally {
      setBusy(false);
    }
  }, [code, f, router]);

  if (!ready) return <Shell><p className="muted pad">Loading…</p></Shell>;
  if (!peek) return <Shell><div className="pad"><div className="card"><h3>Invite not found</h3><p className="small muted">This venue invite link is invalid.</p><a className="btn btn-ghost btn-block" href="/" style={{ marginTop: 12 }}>Go to Sandlot</a></div></div></Shell>;
  if (peek.status !== "pending") {
    return (
      <Shell>
        <div className="pad">
          <div className="card">
            <h3>Invite {String(peek.status)}</h3>
            <p className="small muted">This invite for <b>{String(peek.org_name || "that organization")}</b> is no longer open.</p>
            <a className="btn btn-primary btn-block" href="/venue" style={{ marginTop: 12 }}>Venue portal</a>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="pad">
        <div className="hero-card" style={{ marginBottom: 12 }}>
          <div style={{ fontFamily: "var(--fd)", fontWeight: 800, fontSize: "1.35rem" }}>Host Sandlot at your place</div>
          <p className="small" style={{ opacity: .95, margin: "8px 0 0" }}>
            {String(peek.org_name)} — free family playdates with fidget &amp; toy trading. You control promos and discounts on your other services.
          </p>
        </div>

        {!uid ? (
          <form className="card" onSubmit={auth}>
            <h3 style={{ fontSize: "1.05rem", marginBottom: 8 }}>Create your venue partner login</h3>
            <p className="tiny muted" style={{ margin: "0 0 12px" }}>This is for the organization manager — not kids. Parents use a separate family account later if they want.</p>
            <div className="chips" style={{ marginBottom: 12 }}>
              <button type="button" className={`chip ${authMode === "up" ? "on" : ""}`} onClick={() => setAuthMode("up")}>New account</button>
              <button type="button" className={`chip ${authMode === "in" ? "on" : ""}`} onClick={() => setAuthMode("in")}>I have a login</button>
            </div>
            <div className="field"><label>Work email</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="field"><label>Password</label>
              <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            {err && <p className="note note-sun" style={{ marginBottom: 12 }}>{err}</p>}
            <button className="btn btn-primary btn-block" disabled={busy}>{busy ? "…" : authMode === "up" ? "Create account & continue" : "Sign in & continue"}</button>
          </form>
        ) : (
          <form className="card" onSubmit={claim}>
            <h3 style={{ fontSize: "1.05rem", marginBottom: 8 }}>Confirm your venue profile</h3>
            {peek.message ? <p className="note note-clover small">{String(peek.message)}</p> : null}
            <div className="field"><label>Venue name</label>
              <input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
            <div className="field"><label>Type</label>
              <input readOnly value={VENUE_TYPES.find((t) => t.code === peek.venue_type)?.label || String(peek.venue_type || "")} /></div>
            <div className="grid2">
              <div className="field"><label>Neighborhood</label>
                <input value={f.neighborhood} onChange={(e) => setF({ ...f, neighborhood: e.target.value })} /></div>
              <div className="field"><label>Address</label>
                <input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></div>
            </div>
            <div className="field"><label>Meetup-day promo for Sandlot families</label>
              <input value={f.perk} onChange={(e) => setF({ ...f, perk: e.target.value })} placeholder="Free locker use during playdates" maxLength={200} /></div>
            <div className="field"><label>Discount on your other services</label>
              <input value={f.servicesDiscount} onChange={(e) => setF({ ...f, servicesDiscount: e.target.value })} placeholder="10% off open skate with Sandlot check-in" maxLength={200} /></div>
            <div className="grid2">
              <div className="field"><label>Your name</label>
                <input value={f.contactName} onChange={(e) => setF({ ...f, contactName: e.target.value })} /></div>
              <div className="field"><label>Phone</label>
                <input value={f.contactPhone} onChange={(e) => setF({ ...f, contactPhone: e.target.value })} /></div>
            </div>
            <div className="field"><label>Email</label>
              <input type="email" value={f.contactEmail} onChange={(e) => setF({ ...f, contactEmail: e.target.value })} /></div>
            <div className="field"><label>Hours / access</label>
              <input value={f.hoursNote} onChange={(e) => setF({ ...f, hoursNote: e.target.value })} /></div>
            <div className="field"><label>About your place</label>
              <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={2} maxLength={2000} /></div>
            {err && <p className="note note-sun" style={{ marginBottom: 12 }}>{err}</p>}
            <button className="btn btn-primary btn-block" disabled={busy || !f.name.trim()}>{busy ? "Claiming…" : "Claim venue & go live"}</button>
          </form>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <div className="bar">
        <div className="brand"><div className="mark">🛝</div><b>Sandlot <span style={{ fontFamily: "var(--fm)", fontSize: ".62rem", letterSpacing: ".1em", color: "var(--ink-soft)" }}>VENUE</span></b></div>
        <a className="btn btn-ghost" style={{ padding: "8px 12px", fontSize: ".82rem" }} href="/">Family app</a>
      </div>
      {children}
    </div>
  );
}
