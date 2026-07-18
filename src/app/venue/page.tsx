"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import {
  myManagedVenues, respondVenueDay, updateVenue, venueDayRequests, VENUE_TYPES,
  type AdminVenue, type VenueDayRequest,
} from "@/lib/db";

export default function VenuePortal() {
  const supa = getSupabase();
  const [ready, setReady] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const [venues, setVenues] = useState<AdminVenue[]>([]);
  const [requests, setRequests] = useState<VenueDayRequest[]>([]);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const flash = useCallback((m: string) => { setToast(m); window.setTimeout(() => setToast(""), 2600); }, []);

  useEffect(() => {
    if (!supa) { setReady(true); return; }
    supa.auth.getSession().then(({ data }) => {
      setUid(data.session?.user.id ?? null);
      setReady(true);
    });
    const { data: sub } = supa.auth.onAuthStateChange((_e, s) => setUid(s?.user.id ?? null));
    return () => sub.subscription.unsubscribe();
  }, [supa]);

  const load = useCallback(async () => {
    try {
      const [v, r] = await Promise.all([myManagedVenues(), venueDayRequests().catch(() => [] as VenueDayRequest[])]);
      setVenues(v);
      // only requests for venues I manage
      const ids = new Set(v.map((x) => x.id));
      setRequests(r.filter((x) => ids.has(x.venue_id) || x.parent_id === uid));
      setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't load venues.");
    }
  }, [uid]);

  useEffect(() => { if (uid) load(); }, [uid, load]);

  if (!ready) return <Shell><p className="muted pad">Loading…</p></Shell>;
  if (!supa) return <Shell><p className="muted pad">Not connected.</p></Shell>;
  if (!uid) return <Shell><VenueSignIn /></Shell>;

  return (
    <Shell
      onSignOut={async () => { await supa.auth.signOut(); }}
    >
      <div className="pad">
        <div className="eyebrow first">Your venue dashboard</div>
        <p className="small muted" style={{ margin: "0 0 12px" }}>
          Edit your place, meetup promos, and discounts for Sandlot families on your other services.
          Families only see verified places.
        </p>
        {err && <p className="note note-sun">{err}</p>}
        {requests.filter((r) => r.status === "requested" || r.status === "reviewing").length > 0 && (
          <>
            <div className="eyebrow">Sandlot day requests</div>
            {requests.filter((r) => r.status === "requested" || r.status === "reviewing").map((r) => (
              <DayRequestCard key={r.id} r={r} onChanged={async () => { await load(); flash("Request updated"); }} onFlash={flash} />
            ))}
          </>
        )}

        <div className="eyebrow">Your venues</div>
        {venues.length === 0 ? (
          <div className="card">
            <h3>No venues yet</h3>
            <p className="small muted">Use the invite link Sandlot sent you, or ask the owner to re-invite your organization.</p>
            <a className="btn btn-ghost btn-block" href="/" style={{ marginTop: 12 }}>Family app</a>
          </div>
        ) : venues.map((v) => (
          <VenueEditor key={v.id} v={v} onSaved={async () => { await load(); flash("Saved ✓"); }} onFlash={flash} />
        ))}
      </div>
      {toast && <div className="toast">{toast}</div>}
    </Shell>
  );
}

function DayRequestCard({ r, onChanged, onFlash }: { r: VenueDayRequest; onChanged: () => Promise<void>; onFlash: (m: string) => void }) {
  const [open, setOpen] = useState(true);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  async function act(status: string) {
    setBusy(true);
    try {
      await respondVenueDay(r.id, status, reply);
      await onChanged();
    } catch (e) {
      onFlash(e instanceof Error ? e.message : "Couldn't update.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <button type="button" onClick={() => setOpen((o) => !o)} style={{ width: "100%", background: "none", border: 0, padding: 0, textAlign: "left", cursor: "pointer", color: "inherit" }}>
        <b className="small">{r.preferred_date} · {r.venue_name || "Venue"}</b>
        <div className="tiny muted">{r.parent_name || "Parent"} · {r.status}{r.preferred_time ? ` · ${r.preferred_time}` : ""}</div>
      </button>
      {open && (
        <div style={{ marginTop: 10 }}>
          {r.notes && <p className="small" style={{ margin: "0 0 8px" }}>{r.notes}</p>}
          <div className="field"><label>Reply to family</label>
            <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="We can host 10am–noon in the gym…" /></div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button className="btn btn-primary" style={{ padding: "8px 12px", fontSize: ".8rem" }} disabled={busy} onClick={() => act("approved")}>Approve</button>
            <button className="btn btn-ghost" style={{ padding: "8px 12px", fontSize: ".8rem" }} disabled={busy} onClick={() => act("scheduled")}>Mark scheduled</button>
            <button className="btn btn-ghost" style={{ padding: "8px 12px", fontSize: ".8rem" }} disabled={busy} onClick={() => act("declined")}>Decline</button>
          </div>
        </div>
      )}
    </div>
  );
}

function VenueSignIn() {
  const supa = getSupabase()!;
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      const { error } = await supa.auth.signInWithPassword({ email, password: pw });
      if (error) setErr(error.message);
    } finally { setBusy(false); }
  }
  return (
    <div className="pad">
      <div className="eyebrow first">Venue partner sign-in</div>
      <form className="card" onSubmit={submit}>
        <div className="field"><label>Email</label><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="field"><label>Password</label><input type="password" required value={pw} onChange={(e) => setPw(e.target.value)} /></div>
        {err && <p className="note note-sun">{err}</p>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? "…" : "Sign in"}</button>
      </form>
    </div>
  );
}

function VenueEditor({ v, onSaved, onFlash }: { v: AdminVenue; onSaved: () => Promise<void>; onFlash: (m: string) => void }) {
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    name: v.name,
    venue_type: v.venue_type,
    neighborhood: v.neighborhood || "",
    address: v.address || "",
    perk: v.perk || "",
    services_discount: v.services_discount || "",
    contact_name: v.contact_name || "",
    contact_email: v.contact_email || "",
    contact_phone: v.contact_phone || "",
    description: v.description || "",
    hours_note: v.hours_note || "",
  });

  useEffect(() => {
    setF({
      name: v.name,
      venue_type: v.venue_type,
      neighborhood: v.neighborhood || "",
      address: v.address || "",
      perk: v.perk || "",
      services_discount: v.services_discount || "",
      contact_name: v.contact_name || "",
      contact_email: v.contact_email || "",
      contact_phone: v.contact_phone || "",
      description: v.description || "",
      hours_note: v.hours_note || "",
    });
  }, [v]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await updateVenue(v.id, f);
      await onSaved();
    } catch (err) {
      onFlash(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <button type="button" onClick={() => setOpen((o) => !o)} style={{ width: "100%", background: "none", border: 0, padding: 0, textAlign: "left", cursor: "pointer", color: "inherit" }}>
        <b>{v.name}</b>
        <div className="tiny muted">{v.status} · {VENUE_TYPES.find((t) => t.code === v.venue_type)?.label || v.venue_type}</div>
      </button>
      {open && (
        <form onSubmit={save} style={{ marginTop: 12 }}>
          <div className="field"><label>Name</label>
            <input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div className="field"><label>Type</label>
            <select value={f.venue_type} onChange={(e) => setF({ ...f, venue_type: e.target.value })}>
              {VENUE_TYPES.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
            </select>
          </div>
          <div className="grid2">
            <div className="field"><label>Neighborhood</label>
              <input value={f.neighborhood} onChange={(e) => setF({ ...f, neighborhood: e.target.value })} /></div>
            <div className="field"><label>Address</label>
              <input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></div>
          </div>
          <div className="field"><label>Meetup-day promo</label>
            <input value={f.perk} onChange={(e) => setF({ ...f, perk: e.target.value })} maxLength={200} placeholder="Shown on Sandlot playdates here" /></div>
          <div className="field"><label>Discount on your other services</label>
            <input value={f.services_discount} onChange={(e) => setF({ ...f, services_discount: e.target.value })} maxLength={200} placeholder="10% off open skate for Sandlot families" /></div>
          <div className="note note-sky small" style={{ marginBottom: 12 }}>
            Families see both offers on meetup cards — meetup promo for that day, service discount for your regular business.
          </div>
          <div className="grid2">
            <div className="field"><label>Contact name</label>
              <input value={f.contact_name} onChange={(e) => setF({ ...f, contact_name: e.target.value })} /></div>
            <div className="field"><label>Phone</label>
              <input value={f.contact_phone} onChange={(e) => setF({ ...f, contact_phone: e.target.value })} /></div>
          </div>
          <div className="field"><label>Email</label>
            <input type="email" value={f.contact_email} onChange={(e) => setF({ ...f, contact_email: e.target.value })} /></div>
          <div className="field"><label>Hours / access</label>
            <input value={f.hours_note} onChange={(e) => setF({ ...f, hours_note: e.target.value })} /></div>
          <div className="field"><label>Description</label>
            <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={3} maxLength={2000} /></div>
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? "Saving…" : "Save venue"}</button>
        </form>
      )}
    </div>
  );
}

function Shell({ children, onSignOut }: { children: React.ReactNode; onSignOut?: () => void }) {
  return (
    <div className="shell">
      <div className="bar">
        <div className="brand"><div className="mark">🛝</div><b>Sandlot <span style={{ fontFamily: "var(--fm)", fontSize: ".62rem", letterSpacing: ".1em", color: "var(--ink-soft)" }}>VENUE</span></b></div>
        <div style={{ display: "flex", gap: 8 }}>
          <a className="btn btn-ghost" style={{ padding: "8px 12px", fontSize: ".82rem" }} href="/">Family app</a>
          {onSignOut && <button className="btn btn-ghost" style={{ padding: "8px 12px", fontSize: ".82rem" }} onClick={onSignOut}>Sign out</button>}
        </div>
      </div>
      {children}
    </div>
  );
}
