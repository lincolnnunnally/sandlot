"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ensureMyCode,
  suggestFacility,
  trackShare,
  VENUE_TYPES,
} from "@/lib/db";

/** Parent-facing viral + facility growth tools. */
export function GrowSandlotCard({ onFlash }: { onFlash: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<"invite" | "facility">("invite");
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = code ? `${origin}/join/${code}` : "";

  const loadCode = useCallback(async () => {
    setBusy(true);
    try { setCode(await ensureMyCode()); }
    catch { onFlash("Couldn't load your invite link."); }
    finally { setBusy(false); }
  }, [onFlash]);

  useEffect(() => {
    if (open && panel === "invite" && !code) loadCode();
  }, [open, panel, code, loadCode]);

  async function shareInvite(channel: "native_share" | "copy_link" | "sms") {
    if (!link) return;
    const text =
      "Come trade fidgets & toys and set up playdates with us on Sandlot — free for families. Join with my link:";
    try {
      if (channel === "sms") {
        window.location.href = `sms:?&body=${encodeURIComponent(`${text} ${link}`)}`;
        await trackShare("sms", "invite", { code });
        onFlash("Opening Messages…");
        return;
      }
      if (channel === "native_share" && navigator.share) {
        await navigator.share({ title: "Join us on Sandlot", text, url: link });
        await trackShare("native_share", "invite", { code });
        return;
      }
      await navigator.clipboard?.writeText(`${text} ${link}`);
      await trackShare("copy_link", "invite", { code });
      onFlash("Invite message copied — paste it to other parents! 📋");
    } catch {
      /* dismissed */
    }
  }

  return (
    <>
      <div className="eyebrow">Grow Sandlot</div>
      {!open ? (
        <button className="btn btn-primary btn-block" onClick={() => setOpen(true)}>
          🚀 Invite families &amp; suggest places
        </button>
      ) : (
        <div className="card">
          <div className="seg" style={{ marginBottom: 12 }}>
            <button type="button" className={panel === "invite" ? "on" : ""} onClick={() => setPanel("invite")}>Invite parents</button>
            <button type="button" className={panel === "facility" ? "on" : ""} onClick={() => setPanel("facility")} style={{ gridColumn: "span 2" }}>Suggest a facility</button>
          </div>

          {panel === "invite" && (
            <>
              <p className="small" style={{ margin: "0 0 10px" }}>
                Growth is <b>parent-to-parent</b>: share your personal link. When they join, you&apos;re connected —
                playdates and trades get easier. Kids never get accounts; parents share for them.
              </p>
              {busy || !code ? <p className="tiny muted">Loading your link…</p> : (
                <>
                  <div className="field"><label>Your viral invite link</label>
                    <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} style={{ fontFamily: "var(--fm)", fontSize: ".78rem" }} /></div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                    <button type="button" className="btn btn-primary" style={{ padding: "10px 8px", fontSize: ".8rem" }} onClick={() => shareInvite("native_share")}>Share</button>
                    <button type="button" className="btn btn-ghost" style={{ padding: "10px 8px", fontSize: ".8rem" }} onClick={() => shareInvite("copy_link")}>Copy</button>
                    <button type="button" className="btn btn-ghost" style={{ padding: "10px 8px", fontSize: ".8rem" }} onClick={() => shareInvite("sms")}>Text</button>
                  </div>
                  <p className="tiny muted" style={{ margin: "10px 0 0" }}>
                    Tip: send to school class chats, church groups, sports teams, and neighborhood parents — not strangers cold.
                  </p>
                </>
              )}
            </>
          )}

          {panel === "facility" && (
            <FacilityTipForm
              onFlash={onFlash}
              onDone={() => { setOpen(false); onFlash("Thanks — we added that place to the growth pipeline! 🏢"); }}
            />
          )}

          <button type="button" className="linkish" style={{ marginTop: 12 }} onClick={() => setOpen(false)}>Close</button>
        </div>
      )}
    </>
  );
}

function FacilityTipForm({ onFlash, onDone }: { onFlash: (m: string) => void; onDone: () => void }) {
  const [f, setF] = useState({
    name: "", venueType: "rec_center", neighborhood: "",
    contactName: "", contactEmail: "", contactPhone: "", notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      await suggestFacility({
        name: f.name,
        venueType: f.venueType,
        neighborhood: f.neighborhood,
        contactName: f.contactName,
        contactEmail: f.contactEmail,
        contactPhone: f.contactPhone,
        notes: f.notes,
      });
      await trackShare("facility_pitch", "facility", { name: f.name });
      onDone();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Couldn't submit.");
      onFlash("Couldn't submit facility tip.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <p className="small" style={{ margin: "0 0 10px" }}>
        Know a church hall, library, rec center, or rink that could host playdates?
        Tell us — admins will outreach and add verified locations.
      </p>
      <div className="field"><label>Place name</label>
        <input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Eastside Community Center" maxLength={120} /></div>
      <div className="field"><label>Type</label>
        <select value={f.venueType} onChange={(e) => setF({ ...f, venueType: e.target.value })}>
          {VENUE_TYPES.map((v) => <option key={v.code} value={v.code}>{v.label}</option>)}
        </select>
      </div>
      <div className="field"><label>Neighborhood / area</label>
        <input value={f.neighborhood} onChange={(e) => setF({ ...f, neighborhood: e.target.value })} placeholder="Decatur" /></div>
      <div className="field"><label>Contact name (optional)</label>
        <input value={f.contactName} onChange={(e) => setF({ ...f, contactName: e.target.value })} placeholder="Director or manager" /></div>
      <div className="grid2">
        <div className="field"><label>Email</label>
          <input type="email" value={f.contactEmail} onChange={(e) => setF({ ...f, contactEmail: e.target.value })} /></div>
        <div className="field"><label>Phone</label>
          <input value={f.contactPhone} onChange={(e) => setF({ ...f, contactPhone: e.target.value })} /></div>
      </div>
      <div className="field"><label>Why it&apos;s a good fit</label>
        <textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={2000} rows={2} placeholder="Indoor space, free parking, family-friendly…" /></div>
      {err && <p className="note note-sun" style={{ marginBottom: 10 }}>{err}</p>}
      <button className="btn btn-primary btn-block" disabled={busy || f.name.trim().length < 2}>
        {busy ? "Sending…" : "Send to Sandlot team"}
      </button>
    </form>
  );
}
