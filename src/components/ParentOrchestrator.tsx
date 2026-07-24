"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchAgeBands,
  fetchHostVenues,
  hostCreateSession,
  myCircles,
  myFamilies,
  requestVenueDay,
  venuesMap,
  MEETUP_MODES,
  type AgeBand,
  type Circle,
  type FamilyLink,
  type HostVenue,
  type MeetupMode,
  type AdminVenue,
} from "@/lib/db";
import dynamic from "next/dynamic";

const PlaceFinderMap = dynamic(
  () => import("@/components/PlaceFinderMap").then((m) => m.PlaceFinderMap),
  { ssr: false, loading: () => <p className="muted small">Loading map…</p> },
);

type Props = {
  uid: string;
  defaultZip?: string | null;
  defaultArea?: string | null;
  onCreated: () => void;
  onFlash: (m: string) => void;
  /** A place chosen on the map — opens the host form with it preselected. */
  preselectVenue?: { id: string; name: string; neighborhood: string | null } | null;
  onPreselectConsumed?: () => void;
};

/** Parent-facing meetup orchestrator: event / playground / group / one-on-one. */
export function ParentOrchestrator({ uid, defaultZip, defaultArea, onCreated, onFlash, preselectVenue, onPreselectConsumed }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<MeetupMode>("event");
  const [posted, setPosted] = useState<{ id: string; title: string } | null>(null);
  const [bands, setBands] = useState<AgeBand[]>([]);
  const [venues, setVenues] = useState<HostVenue[]>([]);
  const [allVenues, setAllVenues] = useState<AdminVenue[]>([]);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [families, setFamilies] = useState<FamilyLink[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [panel, setPanel] = useState<"host" | "request">("host");

  const [f, setF] = useState({
    venue_id: "",
    theme: "",
    starts: "",
    hours: 2,
    capacity: 12,
    cost: "Free",
    bands: [] as string[],
    groupIds: [] as string[],
    inviteNote: "",
    swaps_toys: false,
  });
  const [req, setReq] = useState({
    venueId: "",
    date: "",
    time: "10:00",
    notes: "",
  });

  const load = useCallback(async () => {
    const [b, v, c, fam, map] = await Promise.all([
      fetchAgeBands(),
      fetchHostVenues(),
      myCircles().catch(() => [] as Circle[]),
      myFamilies().catch(() => [] as FamilyLink[]),
      venuesMap().catch(() => [] as AdminVenue[]),
    ]);
    setBands(b);
    setVenues(v);
    setCircles(c);
    setFamilies(fam.filter((x) => x.status === "active"));
    setAllVenues(map.filter((x) => x.status === "verified"));
    setF((cur) => ({
      ...cur,
      venue_id: cur.venue_id || v[0]?.id || map.find((x) => x.status === "verified")?.id || "",
      bands: cur.bands.length ? cur.bands : b.slice(0, 2).map((x) => x.code),
    }));
    setReq((cur) => ({
      ...cur,
      venueId: cur.venueId || map.find((x) => x.status === "verified")?.id || "",
    }));
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);

  // A place chosen on the map → open the host form with it selected.
  useEffect(() => {
    if (!preselectVenue) return;
    setPosted(null);
    setOpen(true);
    setPanel("host");
    setVenues((cur) => cur.some((v) => v.id === preselectVenue.id)
      ? cur
      : [...cur, { id: preselectVenue.id, name: preselectVenue.name, neighborhood: preselectVenue.neighborhood, status: "community" }]);
    setF((cur) => ({ ...cur, venue_id: preselectVenue.id }));
    onFlash(`${preselectVenue.name} selected — now pick a day & time, then post.`);
    onPreselectConsumed?.();
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch { /* */ }
  }, [preselectVenue, onFlash, onPreselectConsumed]);

  const shareUrl = posted ? `${typeof window !== "undefined" ? window.location.origin : ""}/m/${posted.id}` : "";
  async function shareLink() {
    const nav = typeof navigator !== "undefined" ? navigator : undefined;
    const data = { title: "Sandlot playdate", text: `Join us: ${posted?.title}`, url: shareUrl };
    try {
      if (nav?.share) { await nav.share(data); return; }
      await nav?.clipboard?.writeText(shareUrl);
      onFlash("Link copied! 📋");
    } catch { /* dismissed */ }
  }
  async function copyLink() { try { await navigator.clipboard.writeText(shareUrl); onFlash("Link copied! 📋"); } catch { /* */ } }

  async function host(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      if (!f.venue_id) throw new Error("Pick a place.");
      if (!f.starts) throw new Error("Pick a date and time.");
      if (!f.bands.length) throw new Error("Pick at least one age group.");
      if (mode === "group" && !f.groupIds.length) throw new Error("Pick a circle to invite.");
      if (mode === "one_on_one") {
        // capacity small for 1:1
      }
      const starts = new Date(f.starts);
      const ends = new Date(starts.getTime() + f.hours * 3600_000);
      const theme =
        f.theme.trim() ||
        (mode === "one_on_one" ? "One-on-one playdate"
          : mode === "playground" ? "Playground hangout"
            : mode === "group" ? "Circle meetup"
              : "Sandlot playdate");

      const newId = await hostCreateSession(uid, {
        venue_id: f.venue_id,
        theme,
        starts_at: starts.toISOString(),
        ends_at: ends.toISOString(),
        target_bands: f.bands,
        capacity_kids: mode === "one_on_one" ? Math.min(f.capacity, 8) : f.capacity,
        cost_note: f.cost,
        groupIds: mode === "group" ? f.groupIds : undefined,
        meetupMode: mode,
        swapsToys: f.swaps_toys,
      });
      onFlash(
        mode === "one_on_one" ? "One-on-one playdate posted! 🤝"
          : mode === "playground" ? "Playground meetup is live! 🌳"
            : mode === "group" ? "Circle meetup posted! 💚"
              : "Event meetup is live! 🏟️"
      );
      setPosted({ id: newId, title: theme }); // show the share step (don't close)
      onCreated();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Couldn't create meetup.");
    } finally {
      setBusy(false);
    }
  }

  async function requestDay(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      if (!req.venueId || !req.date) throw new Error("Pick a venue and date.");
      await requestVenueDay({
        venueId: req.venueId,
        date: req.date,
        time: req.time,
        mode: "event",
        notes: req.notes,
      });
      onFlash("Request sent to the venue! They'll reply on their calendar.");
      setPanel("host");
      onCreated();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Couldn't send request.");
    } finally {
      setBusy(false);
    }
  }

  const modeMeta = MEETUP_MODES.find((m) => m.code === mode)!;

  return (
    <>
      <div className="eyebrow first">Plan a meetup</div>
      {!open ? (
        <button className="btn btn-primary btn-block" onClick={() => setOpen(true)}>
          📅 Host · playground · group · one-on-one
        </button>
      ) : (
        <div className="card">
          {posted && (
            <div>
              <div className="note note-clover" style={{ marginBottom: 12 }}>🎉 <b>{posted.title}</b> is live! Share it so families can RSVP &amp; join.</div>
              <div className="field"><label>Shareable link</label>
                <input readOnly value={shareUrl} onFocus={(e) => e.currentTarget.select()} style={{ fontFamily: "var(--fm)", fontSize: ".8rem" }} /></div>
              <div className="grid2">
                <button type="button" className="btn btn-ghost" onClick={copyLink}>Copy link</button>
                <button type="button" className="btn btn-primary" onClick={shareLink}>Share…</button>
              </div>
              <p className="tiny muted" style={{ margin: "10px 0 0" }}>Anyone with the link can see it and open Sandlot to RSVP. It also shows up for nearby families in the meetups list.</p>
              <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={() => { setPosted(null); setOpen(false); }}>Done</button>
            </div>
          )}

          {!posted && (
          <div className="seg" style={{ marginBottom: 12 }}>
            <button type="button" className={panel === "host" ? "on" : ""} onClick={() => setPanel("host")}>I&apos;ll host</button>
            <button type="button" className={panel === "request" ? "on" : ""} onClick={() => setPanel("request")} style={{ gridColumn: "span 2" }}>Ask a venue for a day</button>
          </div>
          )}

          {!posted && panel === "host" && (
            <form onSubmit={host}>
              <p className="small muted" style={{ margin: "0 0 10px" }}>
                Pick how you want to meet — facility event, park, your circle, or just one other family.
              </p>
              <div className="orch-modes">
                {MEETUP_MODES.map((m) => (
                  <button
                    key={m.code}
                    type="button"
                    className={`orch-mode ${mode === m.code ? "on" : ""}`}
                    onClick={() => setMode(m.code)}
                  >
                    <span className="orch-emoji">{m.emoji}</span>
                    <span className="orch-label">{m.label}</span>
                    <span className="orch-blurb">{m.blurb}</span>
                  </button>
                ))}
              </div>

              <div className="note note-sky small" style={{ margin: "12px 0" }}>
                {modeMeta.emoji} <b>{modeMeta.label}:</b> {modeMeta.blurb}
              </div>

              <div className="field"><label>What&apos;s it called?</label>
                <input value={f.theme} onChange={(e) => setF({ ...f, theme: e.target.value })} placeholder={
                  mode === "one_on_one" ? "Toy trade with the Lees"
                    : mode === "playground" ? "Saturday park swap"
                      : mode === "group" ? "Church circle playdate"
                        : "Fidget swap Saturday"
                } maxLength={40} /></div>

              <div className="field"><label>Where</label>
                <select value={f.venue_id} onChange={(e) => setF({ ...f, venue_id: e.target.value })} required>
                  <option value="">Pick a place…</option>
                  {venues.map((v) => (
                    <option key={v.id} value={v.id}>{v.name}{v.neighborhood ? ` · ${v.neighborhood}` : ""}{v.status === "community" ? " (community)" : ""}</option>
                  ))}
                </select>
                <p className="tiny muted" style={{ marginTop: 6 }}>
                  Don&apos;t see it? Use <b>Find a place on the map</b> below — search parks by zip and tap to choose.
                </p>
              </div>

              <div className="field"><label>When</label>
                <input type="datetime-local" required value={f.starts} onChange={(e) => setF({ ...f, starts: e.target.value })} /></div>

              <div className="grid2">
                <div className="field"><label>Hours</label>
                  <input type="number" min={1} max={6} value={f.hours} onChange={(e) => setF({ ...f, hours: parseInt(e.target.value, 10) || 2 })} /></div>
                <div className="field"><label>Kid capacity</label>
                  <input type="number" min={2} max={mode === "one_on_one" ? 8 : 100} value={f.capacity}
                    onChange={(e) => setF({ ...f, capacity: parseInt(e.target.value, 10) || 12 })} /></div>
              </div>

              <div className="field"><label>Age groups</label>
                <div className="chips">
                  {bands.map((b) => {
                    const on = f.bands.includes(b.code);
                    return (
                      <button key={b.code} type="button" className={`chip ${on ? "on" : ""}`}
                        onClick={() => setF({ ...f, bands: on ? f.bands.filter((x) => x !== b.code) : [...f.bands, b.code] })}>
                        {b.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {mode === "group" && (
                <div className="field"><label>Invite which circle?</label>
                  {circles.length === 0 ? (
                    <p className="tiny muted">Create a circle under Your families first (school, church, neighbors).</p>
                  ) : (
                    <div className="chips">
                      {circles.map((c) => {
                        const on = f.groupIds.includes(c.id);
                        return (
                          <button key={c.id} type="button" className={`chip ${on ? "on" : ""}`}
                            onClick={() => setF({ ...f, groupIds: on ? f.groupIds.filter((x) => x !== c.id) : [...f.groupIds, c.id] })}>
                            💚 {c.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {mode === "one_on_one" && (
                <div className="note note-clover small">
                  One-on-one is best with a family you&apos;re already connected with ({families.length} connected).
                  Share your invite link if you need more connections first.
                </div>
              )}

              <label className="note note-clover small" style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer", margin: "0 0 12px" }}>
                <input type="checkbox" checked={f.swaps_toys} onChange={(e) => setF({ ...f, swaps_toys: e.target.checked })} style={{ width: 18, height: 18, flex: "0 0 auto" }} />
                <span>🤝 Kids will <b>swap or trade toys</b> at this playdate (adds a swap board to the event).</span>
              </label>

              <div className="field"><label>Cost note</label>
                <input value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} placeholder="Free" /></div>

              {err && <p className="note note-sun" style={{ marginBottom: 10 }}>{err}</p>}
              <div className="grid2">
                <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
                <button className="btn btn-primary" disabled={busy}>{busy ? "…" : "Post meetup"}</button>
              </div>
            </form>
          )}

          {!posted && panel === "request" && (
            <form onSubmit={requestDay}>
              <p className="small muted" style={{ margin: "0 0 10px" }}>
                Ask a venue to host a Sandlot day. They approve on their calendar; then you (or they) can finalize the meetup.
              </p>
              <div className="field"><label>Venue</label>
                <select required value={req.venueId} onChange={(e) => setReq({ ...req, venueId: e.target.value })}>
                  <option value="">Pick a verified venue…</option>
                  {allVenues.map((v) => (
                    <option key={v.id} value={v.id}>{v.name}{v.neighborhood ? ` · ${v.neighborhood}` : ""}</option>
                  ))}
                </select>
              </div>
              <div className="grid2">
                <div className="field"><label>Preferred date</label>
                  <input type="date" required value={req.date} onChange={(e) => setReq({ ...req, date: e.target.value })} /></div>
                <div className="field"><label>Time</label>
                  <input type="time" value={req.time} onChange={(e) => setReq({ ...req, time: e.target.value })} /></div>
              </div>
              <div className="field"><label>Note to the venue</label>
                <textarea value={req.notes} onChange={(e) => setReq({ ...req, notes: e.target.value })} rows={2} maxLength={1000}
                  placeholder="About 12 kids, fidget swap, need tables…" /></div>
              {err && <p className="note note-sun" style={{ marginBottom: 10 }}>{err}</p>}
              <div className="grid2">
                <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
                <button className="btn btn-primary" disabled={busy}>{busy ? "…" : "Send request"}</button>
              </div>
            </form>
          )}
        </div>
      )}
    </>
  );
}

export function VenueMapCard({
  uid,
  defaultZip,
  defaultArea,
  onFlash,
  onPlaceChosen,
}: {
  uid: string;
  defaultZip?: string | null;
  defaultArea?: string | null;
  onFlash: (m: string) => void;
  onPlaceChosen?: (venue: { id: string; name: string; neighborhood: string | null }) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="eyebrow">Find a place to meet</div>
      {!open ? (
        <button className="btn btn-ghost btn-block" onClick={() => setOpen(true)}>
          🗺️ Search parks &amp; places near your zip
        </button>
      ) : (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <b className="small">Map search</b>
            <button type="button" className="linkish" onClick={() => setOpen(false)}>Close</button>
          </div>
          <p className="small muted" style={{ margin: "0 0 10px" }}>
            1) Zip is filled from your profile · 2) Search parks/playgrounds · 3) Tap a result for <b>name + street address</b> · 4) <b>Google Maps</b> for directions or <b>Choose for meetup</b>.
          </p>
          <PlaceFinderMap
            uid={uid}
            defaultZip={defaultZip}
            defaultArea={defaultArea}
            onFlash={onFlash}
            onPlaceReady={(v) => {
              onPlaceChosen?.(v);
              onFlash(`${v.name} ready — open Plan a meetup to post there.`);
            }}
          />
        </div>
      )}
    </>
  );
}
