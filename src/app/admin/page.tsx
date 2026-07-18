"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { getSupabase } from "@/lib/supabase";
import {
  adminAddInvite, adminAddVenue, adminCardDetail, adminCreateSession, adminCreateVenueInvite, adminFetchInvites,
  adminFetchParentNames, adminFetchReports, adminFetchSessions, adminFetchVenues, adminInsights, adminListVenueInvites,
  adminModPhoto, adminSafetyQueue, adminSetInviteActive, adminSetReportStatus, adminSetSessionStatus, adminSetVenueStatus,
  fetchAgeBands, isAdmin, updateVenue,
  VENUE_TYPES, type AdminInsights, type AdminReport, type AdminSession, type AdminVenue, type AgeBand, type InviteCode,
  type SafetyQueueItem, type VenueInvite,
} from "@/lib/db";
import { AdminGrowthPanel } from "@/components/AdminGrowth";

function fmt(iso: string) {
  try { return new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
  catch { return iso; }
}

export default function Admin() {
  const supa = getSupabase();
  const [ready, setReady] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [toast, setToast] = useState("");
  const flash = useCallback((m: string) => { setToast(m); window.setTimeout(() => setToast(""), 2600); }, []);

  useEffect(() => {
    if (!supa) { setReady(true); return; }
    supa.auth.getSession().then(({ data }) => { setUid(data.session?.user.id ?? null); setReady(true); });
    const { data: sub } = supa.auth.onAuthStateChange((_e, s) => { setUid(s?.user.id ?? null); if (!s) setAdmin(null); });
    return () => sub.subscription.unsubscribe();
  }, [supa]);

  useEffect(() => { if (uid) isAdmin(uid).then(setAdmin).catch(() => setAdmin(false)); }, [uid]);

  if (!supa) return <Wrap><p className="muted pad">Not connected.</p></Wrap>;
  if (!ready) return <Wrap><p className="muted pad">Loading…</p></Wrap>;
  if (!uid) return <Wrap><SignIn /></Wrap>;
  if (admin === null) return <Wrap><p className="muted pad">Checking access…</p></Wrap>;
  if (!admin) return <Wrap><div className="pad"><div className="card"><h3>Not authorized</h3><p className="small muted" style={{ margin: "6px 0 0" }}>This is the Sandlot owner console. Your account isn&apos;t an admin.</p><a className="btn btn-ghost btn-block" href="/" style={{ marginTop: 12 }}>← Back to the app</a></div></div></Wrap>;

  return (
    <Wrap onSignOut={async () => { await supa.auth.signOut(); }}>
      <Console flash={flash} />
      {toast && <div className="toast">{toast}</div>}
    </Wrap>
  );
}

function Wrap({ children, onSignOut }: { children: React.ReactNode; onSignOut?: () => void }) {
  return (
    <div className="shell">
      <div className="bar">
        <div className="brand"><div className="mark">🛝</div><b>Sandlot <span style={{ fontFamily: "var(--fm)", fontSize: ".62rem", letterSpacing: ".12em", color: "var(--ink-soft)" }}>OWNER</span></b></div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <a className="btn btn-primary" style={{ padding: "8px 12px", fontSize: ".82rem", textDecoration: "none" }} href="/">Family app</a>
          {onSignOut && <button className="btn btn-ghost" style={{ padding: "8px 12px", fontSize: ".82rem" }} onClick={onSignOut}>Sign out</button>}
        </div>
      </div>
      {children}
    </div>
  );
}

function SignIn() {
  const supa = getSupabase()!;
  const [email, setEmail] = useState(""); const [pw, setPw] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setBusy(true);
    try { const { error } = await supa.auth.signInWithPassword({ email, password: pw }); if (error) setErr(error.message); }
    finally { setBusy(false); }
  }
  return (
    <div className="pad"><div className="eyebrow first">Owner sign-in</div>
      <form className="card" onSubmit={submit}>
        <div className="field"><label htmlFor="e">Email</label><input id="e" type="email" value={email} onChange={(ev) => setEmail(ev.target.value)} required /></div>
        <div className="field"><label htmlFor="p">Password</label><input id="p" type="password" value={pw} onChange={(ev) => setPw(ev.target.value)} required /></div>
        {err && <p className="note note-sun" style={{ marginBottom: 12 }}>{err}</p>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? "…" : "Sign in"}</button>
      </form>
    </div>
  );
}

type Tab = "overview" | "growth" | "safety" | "reports" | "meetups" | "venues" | "map" | "invites";

function Console({ flash }: { flash: (m: string) => void }) {
  const [tab, setTab] = useState<Tab>("overview");
  const tabLabel = (t: Tab) => {
    if (t === "safety") return "Photo safety";
    if (t === "growth") return "Growth CRM";
    if (t === "map") return "Venue map";
    return t;
  };
  return (
    <div className="pad">
      <div className="chips" style={{ marginBottom: 14 }}>
        {(["overview", "growth", "safety", "reports", "meetups", "venues", "map", "invites"] as Tab[]).map((t) => (
          <button key={t} className={`chip ${tab === t ? "on" : ""}`} onClick={() => setTab(t)} style={{ textTransform: "capitalize" }}>{tabLabel(t)}</button>
        ))}
      </div>
      {tab === "overview" && <Overview go={setTab} />}
      {tab === "growth" && <AdminGrowthPanel flash={flash} />}
      {tab === "safety" && <PhotoSafetyQueue flash={flash} />}
      {tab === "reports" && <Reports flash={flash} />}
      {tab === "meetups" && <Meetups flash={flash} />}
      {tab === "venues" && <Venues flash={flash} />}
      {tab === "map" && <AdminVenueMap flash={flash} go={setTab} />}
      {tab === "invites" && <Invites flash={flash} />}
    </div>
  );
}

function AdminVenueMap({ flash, go }: { flash: (m: string) => void; go: (t: Tab) => void }) {
  const [uid, setUid] = useState<string | null>(null);
  useEffect(() => {
    getSupabase()?.auth.getSession().then(({ data }) => setUid(data.session?.user.id ?? null));
  }, []);

  return (
    <>
      <div className="eyebrow first">Find &amp; review places</div>
      <p className="small muted" style={{ margin: "0 0 12px" }}>
        Search parks, playgrounds, libraries by zip. Tap a pin to select. Sandlot venues show as blue pins.
        Full venue edit is under <button type="button" className="linkish" onClick={() => go("venues")}>Venues</button>.
      </p>
      {uid ? (
        <div className="card">
          <AdminPlaceFinder uid={uid} flash={flash} />
        </div>
      ) : (
        <p className="muted small">Sign in required.</p>
      )}
    </>
  );
}

function AdminPlaceFinder({ uid, flash }: { uid: string; flash: (m: string) => void }) {
  const PlaceFinder = useMemo(
    () => dynamic(() => import("@/components/PlaceFinderMap").then((m) => m.PlaceFinderMap), {
      ssr: false,
      loading: () => <p className="muted small">Loading map…</p>,
    }),
    [],
  );
  return (
    <PlaceFinder
      uid={uid}
      defaultZip=""
      defaultArea="Atlanta, GA"
      onFlash={flash}
      onPlaceReady={(v) => flash(`${v.name} saved as community place — verify under Venues if ready.`)}
    />
  );
}

function PhotoSafetyQueue({ flash }: { flash: (m: string) => void }) {
  const [items, setItems] = useState<SafetyQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"open" | "all">("open");

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await adminSafetyQueue()); }
    catch (e) { flash(e instanceof Error ? e.message : "Couldn't load safety queue."); }
    finally { setLoading(false); }
  }, [flash]);
  useEffect(() => { load(); }, [load]);

  const shown = filter === "open"
    ? items.filter((r) => ["open", "reviewing", "legal_escalation"].includes(r.status))
    : items;

  const legalCount = shown.filter((r) => r.legal_flag || r.severity === "legal_escalation" || r.status === "legal_escalation").length;
  const photoCount = shown.filter((r) => r.target_type === "listing_photo" || r.severity === "photo_safety" || r.severity === "child_safety").length;

  return (
    <>
      <div className="eyebrow first">Photo &amp; content safety</div>
      <div className="note note-sun small" style={{ marginBottom: 12 }}>
        <b>Kids-app priority.</b> Inappropriate toy photos are hidden from browse as soon as they&apos;re reported.
        You can remove the photo, remove the whole listing, dismiss a false report, or escalate for legal review / possible charges.
        Evidence photo snapshots stay on the report even after the listing is removed.
      </div>
      <div className="chips" style={{ marginBottom: 12 }}>
        <button className={`chip ${filter === "open" ? "on" : ""}`} onClick={() => setFilter("open")}>Needs attention ({shown.length})</button>
        <button className={`chip ${filter === "all" ? "on" : ""}`} onClick={() => setFilter("all")}>All loaded</button>
      </div>
      {(legalCount > 0 || photoCount > 0) && (
        <p className="tiny muted" style={{ margin: "0 0 10px" }}>
          {photoCount > 0 && <>{photoCount} photo-related · </>}
          {legalCount > 0 && <b style={{ color: "var(--coral-ink)" }}>{legalCount} legal escalation</b>}
        </p>
      )}
      {loading ? <p className="muted small">Loading…</p>
        : shown.length === 0 ? <div className="card"><p className="muted small" style={{ margin: 0 }}>No open photo-safety reports. 🎉</p></div>
        : shown.map((r) => <SafetyRow key={r.id} r={r} onChanged={load} flash={flash} />)}
    </>
  );
}

function SafetyRow({ r, onChanged, flash }: { r: SafetyQueueItem; onChanged: () => Promise<void>; flash: (m: string) => void }) {
  const [notes, setNotes] = useState(r.admin_notes || "");
  const [busy, setBusy] = useState(false);
  const hot = r.legal_flag || r.severity === "legal_escalation" || r.severity === "child_safety" || r.status === "legal_escalation";

  async function act(action: "remove_photo" | "remove_listing" | "restore_photo" | "dismiss" | "legal") {
    setBusy(true);
    try {
      const res = await adminModPhoto(r.id, action, notes);
      flash(
        action === "legal" ? "Escalated for legal review. Listing removed; evidence kept on report."
          : action === "remove_photo" ? "Photo removed from app."
            : action === "remove_listing" ? "Listing removed from marketplace."
              : action === "restore_photo" ? "Photo restored."
                : "Report dismissed."
      );
      void res;
      await onChanged();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 12, borderColor: hot ? "var(--coral)" : undefined }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontFamily: "var(--fm)", fontSize: ".62rem", letterSpacing: ".06em", textTransform: "uppercase", color: hot ? "var(--coral-ink)" : "var(--ink-soft)" }}>
          {r.severity || "standard"} · {r.status} · {fmt(r.created_at)}
        </span>
        {r.legal_flag && <span className="chip" style={{ background: "var(--coral)", color: "#fff", borderColor: "transparent", fontSize: ".7rem" }}>LEGAL</span>}
      </div>
      <h3 style={{ fontSize: "1rem", margin: "6px 0 4px" }}>{r.reason}</h3>
      <p className="tiny muted" style={{ margin: 0 }}>
        {r.target_label || r.toy_name || "Listing"} · reporter: {r.reporter_name || "parent"} · subject: {r.subject_name || "—"}
      </p>
      {r.details && <p className="small" style={{ margin: "8px 0 0", whiteSpace: "pre-wrap" }}>{r.details}</p>}

      {(r.photo_url_snapshot || r.emoji) && (
        <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
          {r.photo_url_snapshot
            ? <img src={r.photo_url_snapshot} alt="Reported" style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 10, border: "2px solid var(--coral)" }} />
            : <div className="av" style={{ width: 96, height: 96, fontSize: "2.5rem" }}>{r.emoji || "🧸"}</div>}
          <div className="tiny muted">
            Snapshot retained for review{r.listing_status ? ` · listing now: ${r.listing_status}` : ""}
            {r.listing_photo_status ? ` · photo: ${r.listing_photo_status}` : ""}
            {r.action_taken ? ` · last action: ${r.action_taken}` : ""}
          </div>
        </div>
      )}

      <div className="field" style={{ margin: "12px 0 8px" }}>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={4000} rows={2} placeholder="Admin notes (what you did, who you called…)…" />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button className="btn btn-coral" style={{ padding: "8px 12px", fontSize: ".8rem" }} disabled={busy} onClick={() => act("remove_photo")}>Remove photo</button>
        <button className="btn btn-coral" style={{ padding: "8px 12px", fontSize: ".8rem" }} disabled={busy} onClick={() => act("remove_listing")}>Remove listing</button>
        <button className="btn btn-ghost" style={{ padding: "8px 12px", fontSize: ".8rem", borderColor: "var(--coral)", color: "var(--coral-ink)" }} disabled={busy} onClick={() => act("legal")}>Escalate legal / charges</button>
        <button className="btn btn-ghost" style={{ padding: "8px 12px", fontSize: ".8rem" }} disabled={busy} onClick={() => act("restore_photo")}>Restore photo</button>
        <button className="btn btn-ghost" style={{ padding: "8px 12px", fontSize: ".8rem" }} disabled={busy} onClick={() => act("dismiss")}>Dismiss</button>
      </div>
      <p className="tiny muted" style={{ margin: "10px 0 0" }}>
        Legal escalation removes the listing, keeps the photo snapshot on this report, and marks it for your follow-up with counsel / law enforcement as appropriate.
      </p>
    </div>
  );
}

function fmtDay(iso: string) {
  try { return new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }); }
  catch { return iso; }
}

function Overview({ go }: { go: (t: Tab) => void }) {
  const [d, setD] = useState<AdminInsights | null>(null);
  const [err, setErr] = useState("");
  const [detail, setDetail] = useState<{ key: string; title: string; rows: Record<string, unknown>[]; loading: boolean } | null>(null);

  useEffect(() => { adminInsights().then(setD).catch((e) => setErr(e instanceof Error ? e.message : "Couldn't load insights.")); }, []);

  async function openCard(key: string, title: string, tabFallback?: Tab) {
    setDetail({ key, title, rows: [], loading: true });
    try {
      const rows = await adminCardDetail(key);
      setDetail({ key, title, rows, loading: false });
    } catch {
      setDetail({ key, title, rows: [], loading: false });
      if (tabFallback) go(tabFallback);
    }
  }

  if (err) return <p className="note note-sun">{err}</p>;
  if (!d) return <p className="muted small">Loading the picture…</p>;

  const { totals: t, growth: g, engagement: e, safety: s, attention: a } = d;
  const pctConnected = t.parents ? Math.round((e.parents_with_connection / t.parents) * 100) : 0;

  const stat = (n: number | string, l: string, cardKey: string, delta?: string, tabFallback?: Tab) => (
    <button
      type="button"
      className="card kpi-click"
      style={{ textAlign: "center", padding: "14px 8px", width: "100%", cursor: "pointer", color: "inherit", font: "inherit" }}
      onClick={() => openCard(cardKey, l, tabFallback)}
    >
      <div style={{ fontFamily: "var(--fd)", fontWeight: 800, fontSize: "1.5rem", lineHeight: 1.1 }}>{n}</div>
      <div className="tiny muted" style={{ marginTop: 3 }}>{l}</div>
      {delta && <div style={{ fontFamily: "var(--fm)", fontSize: ".62rem", marginTop: 3, color: "var(--clover-deep)" }}>{delta}</div>}
      <div className="tiny" style={{ marginTop: 6, color: "var(--clover-deep)" }}>Tap for details →</div>
    </button>
  );

  return (
    <>
      <div className="note note-sky small" style={{ marginBottom: 12 }}>
        Tap any number card to open a live list of the people, meetups, or places behind it. Use <b>Family app</b> (top right) anytime to switch into the parent experience.
      </div>

      {/* Safety first */}
      {s.open_reports > 0 ? (
        <button className="note note-sun small" style={{ width: "100%", textAlign: "left", cursor: "pointer", border: "1px solid var(--coral)" }} onClick={() => go("safety")}>
          ⚠️ <b>{s.open_reports}</b> safety {s.open_reports === 1 ? "report" : "reports"} need your attention — open Photo safety for photo removals &amp; legal escalation.
        </button>
      ) : (
        <div className="note note-clover small">🛟 No open safety reports. All clear.</div>
      )}

      <div className="eyebrow">How it&apos;s growing</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {stat(t.parents, "parents", "parents", g.parents_7d ? `+${g.parents_7d} this wk` : undefined)}
        {stat(t.kids, "kids", "kids", g.kids_7d ? `+${g.kids_7d} this wk` : undefined)}
        {stat(t.connections, "connections", "connections", g.connections_7d ? `+${g.connections_7d} this wk` : undefined)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 8 }}>
        {stat(t.meetups_upcoming, "upcoming meetups", "meetups", undefined, "meetups")}
        {stat(t.rsvps, "RSVPs", "rsvps", g.rsvps_7d ? `+${g.rsvps_7d} this wk` : undefined)}
        {stat(t.checkins, "check-ins", "checkins")}
      </div>

      <div className="eyebrow">Health &amp; engagement</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {stat(`${pctConnected}%`, "parents connected", "connections")}
        {stat(e.avg_rsvps_per_meetup, "avg RSVPs / meetup", "rsvps")}
        {stat(t.host_parents, "parent hosts", "parent hosts")}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 8 }}>
        {stat(t.venues_verified, "verified places", "venues", undefined, "venues")}
        {stat(t.venues_community, "community places", "venues", undefined, "venues")}
        {stat(t.circles, "circles", "circles")}
      </div>

      {/* Needs attention */}
      <div className="eyebrow">Needs your attention</div>
      <div className="card">
        {a.community_venues.length === 0 && a.empty_upcoming_meetups.length === 0 && a.meetups_next_3d.length === 0 && s.open_reports === 0 ? (
          <p className="muted small" style={{ margin: 0 }}>Nothing needs you right now. 🎉</p>
        ) : (
          <>
            {a.community_venues.length > 0 && (
              <AttnRow icon="📍" onClick={() => go("venues")}
                title={`${a.community_venues.length} parent-added place${a.community_venues.length === 1 ? "" : "s"} to review`}
                sub={a.community_venues.map((v) => v.name).slice(0, 3).join(" · ")} action="Review →" />
            )}
            {a.meetups_next_3d.length > 0 && (
              <AttnRow icon="⏰" onClick={() => go("meetups")}
                title={`${a.meetups_next_3d.length} meetup${a.meetups_next_3d.length === 1 ? "" : "s"} in the next 3 days`}
                sub={a.meetups_next_3d.map((m) => `${m.title} · ${fmtDay(m.starts_at)}`).slice(0, 3).join(" · ")} action="Open →" />
            )}
            {a.empty_upcoming_meetups.length > 0 && (
              <AttnRow icon="🫥" onClick={() => go("meetups")}
                title={`${a.empty_upcoming_meetups.length} upcoming meetup${a.empty_upcoming_meetups.length === 1 ? "" : "s"} with no RSVPs yet`}
                sub={a.empty_upcoming_meetups.map((m) => m.title).slice(0, 3).join(" · ")} action="Promote →" />
            )}
          </>
        )}
      </div>

      {/* Opportunities */}
      <div className="eyebrow">Opportunities to grow &amp; earn</div>
      <div className="card">
        <button type="button" className="btn btn-primary btn-block" style={{ marginBottom: 12 }} onClick={() => go("growth")}>
          Open Growth CRM dashboard →
        </button>
        <button type="button" className="btn btn-ghost btn-block" style={{ marginBottom: 12 }} onClick={() => go("venues")}>
          Invite an organization to host →
        </button>
        {a.unconnected_parents > 0 && (
          <p className="small" style={{ margin: "0 0 10px" }}>🤝 <b>{a.unconnected_parents}</b> {a.unconnected_parents === 1 ? "family isn't" : "families aren't"} connected to anyone yet — push invite sharing from the Growth tab.</p>
        )}
        <p className="small" style={{ margin: 0 }}>🎟️ Venue partners can set meetup promos <b>and</b> discounts on their other services (skating, gym, etc.).</p>
      </div>

      {detail && (
        <CardDetailModal
          title={detail.title}
          loading={detail.loading}
          rows={detail.rows}
          onClose={() => setDetail(null)}
          onGoTab={(tab) => { setDetail(null); go(tab); }}
        />
      )}
    </>
  );
}

function CardDetailModal({
  title, loading, rows, onClose, onGoTab,
}: {
  title: string;
  loading: boolean;
  rows: Record<string, unknown>[];
  onClose: () => void;
  onGoTab: (t: Tab) => void;
}) {
  return (
    <div className="modal-scrim" role="dialog" aria-modal="true">
      <div className="card modal-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <b style={{ textTransform: "capitalize" }}>{title}</b>
          <button type="button" className="linkish" onClick={onClose}>Close</button>
        </div>
        {loading ? <p className="muted small">Loading details…</p>
          : rows.length === 0 ? <p className="muted small">No rows yet for this metric.</p>
          : (
            <div style={{ maxHeight: "60vh", overflow: "auto" }}>
              {rows.map((r, i) => (
                <div key={i} className="kidrow" style={{ marginBottom: 8, alignItems: "flex-start" }}>
                  <div className="av">•</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="nm" style={{ wordBreak: "break-word" }}>
                      {String(r.display_name || r.parent_name || r.name || r.nickname || r.toy_name || r.title || r.meetup || r.name_a || "Item")}
                      {r.name_b ? ` ↔ ${String(r.name_b)}` : ""}
                    </div>
                    <div className="bd" style={{ wordBreak: "break-word" }}>
                      {[
                        r.area_label, r.zip, r.venue_name, r.category, r.status, r.venue_type, r.neighborhood,
                        r.attendance_mode, r.age_band_code, r.source, r.perk, r.services_discount,
                        r.rsvps != null ? `${r.rsvps} RSVPs` : null,
                        r.hosted != null ? `${r.hosted} hosted` : null,
                        r.members != null ? `${r.members} members` : null,
                        r.starts_at ? fmt(String(r.starts_at)) : null,
                        r.created_at ? fmt(String(r.created_at)) : null,
                        r.checked_in_at ? `checked in ${fmt(String(r.checked_in_at))}` : null,
                      ].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        <div className="grid2" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Close</button>
          <button type="button" className="btn btn-primary" onClick={() => {
            const t = title.toLowerCase();
            if (t.includes("meetup") || t.includes("rsvp") || t.includes("check")) onGoTab("meetups");
            else if (t.includes("venue") || t.includes("place")) onGoTab("venues");
            else if (t.includes("parent") || t.includes("connect") || t.includes("kid") || t.includes("host") || t.includes("circle")) onGoTab("growth");
            else onGoTab("growth");
          }}>Open related tab</button>
        </div>
      </div>
    </div>
  );
}

function AttnRow({ icon, title, sub, action, onClick }: { icon: string; title: string; sub?: string; action: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", background: "none", border: "none", borderBottom: "1px solid var(--line)", padding: "10px 0", cursor: "pointer" }}>
      <span style={{ fontSize: "1.1rem" }}>{icon}</span>
      <span style={{ flex: 1 }}>
        <span className="small" style={{ display: "block", fontWeight: 600 }}>{title}</span>
        {sub && <span className="tiny muted" style={{ display: "block", marginTop: 1 }}>{sub}</span>}
      </span>
      <span className="tiny" style={{ color: "var(--clover-deep)", whiteSpace: "nowrap" }}>{action}</span>
    </button>
  );
}

const REPORT_STATUS_LABEL: Record<string, string> = {
  open: "new", reviewing: "reviewing", actioned: "actioned", dismissed: "dismissed",
};

function Reports({ flash }: { flash: (m: string) => void }) {
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminFetchReports();
      setReports(r);
      const nm = await adminFetchParentNames([...r.map((x) => x.reporter_id), ...r.map((x) => x.subject_parent_id)]);
      setNames(nm);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openCount = reports.filter((r) => r.status === "open" || r.status === "reviewing").length;
  const shown = showAll ? reports : reports.filter((r) => r.status === "open" || r.status === "reviewing");

  return (
    <>
      <div className="eyebrow first">Reports {openCount > 0 && <span className="chip" style={{ padding: "2px 8px", background: "var(--coral-soft)", color: "var(--coral-ink)", borderColor: "transparent" }}>{openCount} open</span>}</div>
      <div className="chips" style={{ marginBottom: 12 }}>
        <button className={`chip ${!showAll ? "on" : ""}`} onClick={() => setShowAll(false)}>Needs attention</button>
        <button className={`chip ${showAll ? "on" : ""}`} onClick={() => setShowAll(true)}>All</button>
      </div>
      {loading ? <p className="muted small">Loading…</p>
        : shown.length === 0 ? <div className="card"><p className="muted small" style={{ margin: 0 }}>{showAll ? "No reports yet." : "Nothing needs attention right now. 🎉"}</p></div>
        : shown.map((r) => <ReportRow key={r.id} r={r} names={names} onChanged={load} flash={flash} />)}
    </>
  );
}

function ReportRow({ r, names, onChanged, flash }: { r: AdminReport; names: Record<string, string>; onChanged: () => Promise<void>; flash: (m: string) => void }) {
  const [notes, setNotes] = useState(r.admin_notes || "");
  const [busy, setBusy] = useState(false);
  const reporter = names[r.reporter_id] || "a parent";
  const subject = r.subject_parent_id ? (names[r.subject_parent_id] || "another parent") : null;
  const statusColor = r.status === "open" ? "var(--coral-soft)" : r.status === "reviewing" ? "var(--sunshine-soft)" : "var(--paper-2)";
  const statusInk = r.status === "open" ? "var(--coral-ink)" : r.status === "reviewing" ? "var(--sunshine-ink)" : "var(--ink-faint)";

  async function setStatus(status: string) {
    setBusy(true);
    try { await adminSetReportStatus(r.id, status, notes); await onChanged(); flash(`Marked ${REPORT_STATUS_LABEL[status] || status}.`); }
    finally { setBusy(false); }
  }
  async function saveNotes() {
    setBusy(true);
    try { await adminSetReportStatus(r.id, r.status, notes); await onChanged(); flash("Notes saved."); }
    finally { setBusy(false); }
  }

  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
        <span style={{ fontFamily: "var(--fm)", fontSize: ".62rem", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink-soft)" }}>{r.target_type} · {fmt(r.created_at)}</span>
        <span className="chip" style={{ padding: "2px 9px", background: statusColor, color: statusInk, borderColor: "transparent", fontSize: ".7rem" }}>{REPORT_STATUS_LABEL[r.status] || r.status}</span>
      </div>
      <h3 style={{ fontSize: "1rem", margin: "4px 0 2px" }}>{r.reason}</h3>
      {r.target_label && <div className="tiny muted">{r.target_label}</div>}
      {r.details && <p className="small" style={{ margin: "8px 0 0", whiteSpace: "pre-wrap" }}>{r.details}</p>}
      <p className="tiny muted" style={{ margin: "8px 0 0" }}>From {reporter}{subject ? ` · about ${subject}` : ""}</p>

      <div className="field" style={{ margin: "10px 0 8px" }}>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={4000} rows={2} placeholder="Internal notes (what you did about it)…" />
      </div>
      <div className="chips">
        {r.status !== "reviewing" && r.status !== "actioned" && r.status !== "dismissed" && <button className="mini-btn" disabled={busy} onClick={() => setStatus("reviewing")}>Start review</button>}
        {r.status !== "actioned" && <button className="mini-btn" disabled={busy} onClick={() => setStatus("actioned")}>Mark actioned</button>}
        {r.status !== "dismissed" && <button className="mini-btn" disabled={busy} onClick={() => setStatus("dismissed")}>Dismiss</button>}
        {(r.status === "actioned" || r.status === "dismissed") && <button className="mini-btn" disabled={busy} onClick={() => setStatus("open")}>Reopen</button>}
        <button className="mini-btn" disabled={busy} onClick={saveNotes}>Save notes</button>
      </div>
      <p className="tiny muted" style={{ margin: "10px 0 0" }}>Tip: to remove a reported meetup, unpublish it in the Meetups tab; to pause a venue, use the Venues tab.</p>
    </div>
  );
}

function Venues({ flash }: { flash: (m: string) => void }) {
  const [venues, setVenues] = useState<AdminVenue[]>([]);
  const [invites, setInvites] = useState<VenueInvite[]>([]);
  const [mode, setMode] = useState<"list" | "manual" | "invite">("list");
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    name: "", venue_type: "church_hall", neighborhood: "", address: "", perk: "", services_discount: "",
    contact_name: "", contact_email: "", contact_phone: "", description: "", hours_note: "",
  });
  const [inv, setInv] = useState({
    orgName: "", contactEmail: "", contactName: "", venueType: "rec_center", neighborhood: "", message: "",
  });
  const [lastInviteLink, setLastInviteLink] = useState("");

  const load = useCallback(async () => {
    const [v, i] = await Promise.all([
      adminFetchVenues(),
      adminListVenueInvites().catch(() => [] as VenueInvite[]),
    ]);
    setVenues(v);
    setInvites(i);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function saveManual(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      await adminAddVenue(f);
      setMode("list");
      setF({ name: "", venue_type: "church_hall", neighborhood: "", address: "", perk: "", services_discount: "", contact_name: "", contact_email: "", contact_phone: "", description: "", hours_note: "" });
      await load();
      flash("Venue added ✓");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Couldn't add venue.");
    } finally { setBusy(false); }
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      const supa = getSupabase();
      const session = (await supa?.auth.getSession())?.data.session;
      if (!session?.access_token) throw new Error("Sign in again.");

      if (inv.contactEmail.includes("@")) {
        // Create invite + send email via Resend (server)
        const res = await fetch("/api/venue/invite", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            orgName: inv.orgName,
            contactEmail: inv.contactEmail,
            contactName: inv.contactName,
            venueType: inv.venueType,
            neighborhood: inv.neighborhood,
            message: inv.message,
            origin: typeof window !== "undefined" ? window.location.origin : "",
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Invite failed");
        setLastInviteLink(data.link || "");
        try { if (data.link) await navigator.clipboard.writeText(data.link); } catch { /* ignore */ }
        flash(data.emailed
          ? `Invite emailed to ${inv.contactEmail} ✓`
          : (data.warning || "Invite created — email not sent; link copied."));
      } else {
        const res = await adminCreateVenueInvite({
          orgName: inv.orgName,
          contactEmail: inv.contactEmail,
          contactName: inv.contactName,
          venueType: inv.venueType,
          neighborhood: inv.neighborhood,
          message: inv.message,
        });
        const link = `${typeof window !== "undefined" ? window.location.origin : ""}/venue/claim/${res.code}`;
        setLastInviteLink(link);
        try { await navigator.clipboard.writeText(link); } catch { /* ignore */ }
        flash("Invite link created (add email next time to auto-send).");
      }
      setMode("list");
      setInv({ orgName: "", contactEmail: "", contactName: "", venueType: "rec_center", neighborhood: "", message: "" });
      await load();
    } catch (err) {
      flash(err instanceof Error ? err.message : "Couldn't create invite.");
    } finally { setBusy(false); }
  }

  return (
    <>
      <div className="eyebrow first">Venues &amp; host partners</div>
      <p className="small muted" style={{ margin: "0 0 12px" }}>
        Invite organizations to sign up as meetup locations, or add a place yourself. Partners can manage promos and service discounts.
      </p>

      {mode === "list" && (
        <div className="grid2" style={{ marginBottom: 12 }}>
          <button className="btn btn-primary" onClick={() => setMode("invite")}>✉ Invite organization</button>
          <button className="btn btn-ghost" onClick={() => setMode("manual")}>+ Add manually</button>
        </div>
      )}

      {lastInviteLink && mode === "list" && (
        <div className="card" style={{ marginBottom: 12 }}>
          <b className="small">Last org invite link</b>
          <input readOnly value={lastInviteLink} onFocus={(e) => e.currentTarget.select()} style={{ marginTop: 8, fontFamily: "var(--fm)", fontSize: ".75rem", width: "100%" }} />
        </div>
      )}

      {mode === "invite" && (
        <form className="card" onSubmit={sendInvite} style={{ marginBottom: 12 }}>
          <h3 style={{ fontSize: "1.05rem", marginBottom: 8 }}>Invite organization to host</h3>
          <p className="tiny muted" style={{ margin: "0 0 12px" }}>They get a secure link to create their venue profile (no admin password). You can still edit anything later.</p>
          <div className="field"><label>Organization name</label>
            <input required value={inv.orgName} onChange={(e) => setInv({ ...inv, orgName: e.target.value })} placeholder="Eastside Community Center" /></div>
          <div className="grid2">
            <div className="field"><label>Contact name</label>
              <input value={inv.contactName} onChange={(e) => setInv({ ...inv, contactName: e.target.value })} /></div>
            <div className="field"><label>Contact email</label>
              <input type="email" value={inv.contactEmail} onChange={(e) => setInv({ ...inv, contactEmail: e.target.value })} placeholder="manager@…" /></div>
          </div>
          <div className="grid2">
            <div className="field"><label>Type</label>
              <select value={inv.venueType} onChange={(e) => setInv({ ...inv, venueType: e.target.value })}>{VENUE_TYPES.map((v) => <option key={v.code} value={v.code}>{v.label}</option>)}</select></div>
            <div className="field"><label>Area</label>
              <input value={inv.neighborhood} onChange={(e) => setInv({ ...inv, neighborhood: e.target.value })} /></div>
          </div>
          <div className="field"><label>Personal note (optional)</label>
            <textarea value={inv.message} onChange={(e) => setInv({ ...inv, message: e.target.value })} rows={2} placeholder="We'd love to host Saturday morning swaps…" /></div>
          <div className="grid2">
            <button type="button" className="btn btn-ghost" onClick={() => setMode("list")}>Cancel</button>
            <button className="btn btn-primary" disabled={busy || inv.orgName.trim().length < 2}>{busy ? "…" : "Create invite link"}</button>
          </div>
        </form>
      )}

      {mode === "manual" && (
        <form className="card" onSubmit={saveManual} style={{ marginBottom: 12 }}>
          <h3 style={{ fontSize: "1.05rem", marginBottom: 8 }}>Add venue manually</h3>
          <VenueFields f={f} setF={setF} />
          <div className="grid2">
            <button type="button" className="btn btn-ghost" onClick={() => setMode("list")}>Cancel</button>
            <button className="btn btn-primary" disabled={busy || !f.name.trim()}>{busy ? "…" : "Add venue"}</button>
          </div>
        </form>
      )}

      {invites.filter((i) => i.status === "pending").length > 0 && (
        <>
          <div className="eyebrow">Pending org invites</div>
          {invites.filter((i) => i.status === "pending").map((i) => {
            const link = `${typeof window !== "undefined" ? window.location.origin : ""}/venue/claim/${i.code}`;
            return (
              <div key={i.id} className="card" style={{ marginBottom: 8 }}>
                <b className="small">{i.org_name}</b>
                <div className="tiny muted">{i.contact_email || "no email"} · expires {fmt(i.expires_at)}</div>
                <button type="button" className="linkish" style={{ marginTop: 6 }} onClick={async () => {
                  try { await navigator.clipboard.writeText(link); flash("Invite link copied"); } catch { flash(link); }
                }}>Copy claim link</button>
              </div>
            );
          })}
        </>
      )}

      <div className="eyebrow">All venues</div>
      {venues.map((v) => (
        <VenueRow
          key={v.id}
          v={v}
          expanded={editId === v.id}
          onToggle={() => setEditId(editId === v.id ? null : v.id)}
          onChanged={load}
          flash={flash}
        />
      ))}
      {!venues.length && <p className="muted small">No venues yet — invite an organization or add one manually.</p>}
    </>
  );
}

type VenueFormFields = {
  name: string; venue_type: string; neighborhood: string; address: string; perk: string;
  services_discount: string; contact_name: string; contact_email: string; contact_phone: string;
  description: string; hours_note: string;
};

function VenueFields<T extends VenueFormFields>({ f, setF }: { f: T; setF: (f: T) => void }) {
  const set = (patch: Partial<VenueFormFields>) => setF({ ...f, ...patch });
  return (
    <>
      <div className="field"><label>Name</label>
        <input required value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Galaxy Roller Rink" /></div>
      <div className="field"><label>Type</label>
        <select value={f.venue_type} onChange={(e) => set({ venue_type: e.target.value })}>{VENUE_TYPES.map((v) => <option key={v.code} value={v.code}>{v.label}</option>)}</select></div>
      <div className="grid2">
        <div className="field"><label>Neighborhood</label>
          <input value={f.neighborhood} onChange={(e) => set({ neighborhood: e.target.value })} /></div>
        <div className="field"><label>Address</label>
          <input value={f.address} onChange={(e) => set({ address: e.target.value })} placeholder="Shown after verify" /></div>
      </div>
      <div className="field"><label>Meetup-day promo (Sandlot playdates)</label>
        <input value={f.perk} onChange={(e) => set({ perk: e.target.value })} placeholder="$3 skate rental for meetup kids" maxLength={200} /></div>
      <div className="field"><label>Discount on other services</label>
        <input value={f.services_discount} onChange={(e) => set({ services_discount: e.target.value })} placeholder="10% off open skate anytime with Sandlot check-in" maxLength={200} /></div>
      <div className="grid2">
        <div className="field"><label>Contact name</label>
          <input value={f.contact_name} onChange={(e) => set({ contact_name: e.target.value })} /></div>
        <div className="field"><label>Contact phone</label>
          <input value={f.contact_phone} onChange={(e) => set({ contact_phone: e.target.value })} /></div>
      </div>
      <div className="field"><label>Contact email</label>
        <input type="email" value={f.contact_email} onChange={(e) => set({ contact_email: e.target.value })} /></div>
      <div className="field"><label>Hours / access notes</label>
        <input value={f.hours_note} onChange={(e) => set({ hours_note: e.target.value })} placeholder="Saturdays 9–noon; side door" /></div>
      <div className="field"><label>Description</label>
        <textarea value={f.description} onChange={(e) => set({ description: e.target.value })} rows={2} maxLength={2000} /></div>
    </>
  );
}

function VenueRow({ v, expanded, onToggle, onChanged, flash }: {
  v: AdminVenue; expanded: boolean; onToggle: () => void; onChanged: () => Promise<void>; flash: (m: string) => void;
}) {
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
    status: v.status,
  });
  const typeLabel = VENUE_TYPES.find((t) => t.code === v.venue_type)?.label || v.venue_type;
  const paused = v.status === "paused";

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
      status: v.status,
    });
  }, [v]);

  async function saveFull() {
    setBusy(true);
    try {
      await updateVenue(v.id, f);
      flash("Venue updated ✓");
      await onChanged();
      onToggle();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Couldn't save.");
    } finally { setBusy(false); }
  }

  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <button type="button" onClick={onToggle} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", color: "inherit" }}>
        <div style={{ flex: 1 }}>
          <b className="small">{v.name}</b>
          <div className="tiny muted">{typeLabel}{v.neighborhood ? ` · ${v.neighborhood}` : ""} · {v.status}</div>
          {v.perk && <div className="tiny" style={{ color: "var(--clover-deep)", marginTop: 2 }}>🎟️ {v.perk}</div>}
          {v.services_discount && <div className="tiny" style={{ color: "var(--sky-ink)", marginTop: 2 }}>🏷️ {v.services_discount}</div>}
        </div>
        <span className="tiny" style={{ color: "var(--clover-deep)" }}>{expanded ? "Close" : "Edit →"}</span>
      </button>

      {!expanded && (
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <button className="mini-btn" disabled={busy} onClick={async () => {
            setBusy(true);
            try {
              await adminSetVenueStatus(v.id, paused ? "verified" : "paused");
              await onChanged();
              flash(paused ? "Verified ✓" : "Paused");
            } finally { setBusy(false); }
          }}>{paused ? "Verify" : "Pause"}</button>
          {v.status === "community" && (
            <button className="mini-btn" disabled={busy} onClick={async () => {
              setBusy(true);
              try { await adminSetVenueStatus(v.id, "verified"); await onChanged(); flash("Verified ✓"); }
              finally { setBusy(false); }
            }}>Verify community place</button>
          )}
        </div>
      )}

      {expanded && (
        <div style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
          <VenueFields f={f} setF={setF} />
          <div className="field"><label>Status</label>
            <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
              {["verified", "community", "paused", "pending", "invited"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="grid2">
            <button type="button" className="btn btn-ghost" onClick={onToggle}>Cancel</button>
            <button type="button" className="btn btn-primary" disabled={busy || !f.name.trim()} onClick={saveFull}>{busy ? "…" : "Save all fields"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Meetups({ flash }: { flash: (m: string) => void }) {
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [venues, setVenues] = useState<AdminVenue[]>([]);
  const [bands, setBands] = useState<AgeBand[]>([]);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [f, setF] = useState({ venue_id: "", title: "", theme: "", starts: "", hours: 3, capacity: 24, cost: "", bands: [] as string[] });

  const load = useCallback(async () => {
    const [s, v, b] = await Promise.all([adminFetchSessions(), adminFetchVenues(), fetchAgeBands()]);
    setSessions(s); setVenues(v.filter((x) => x.status === "verified")); setBands(b);
    setF((cur) => ({ ...cur, venue_id: cur.venue_id || v.find((x) => x.status === "verified")?.id || "" }));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    if (!f.venue_id) { setErr("Add a verified venue first (Venues tab)."); return; }
    if (!f.starts) { setErr("Pick a date & time."); return; }
    if (!f.bands.length) { setErr("Pick at least one age group."); return; }
    setBusy(true);
    try {
      const starts = new Date(f.starts);
      const ends = new Date(starts.getTime() + f.hours * 3600 * 1000);
      await adminCreateSession({
        venue_id: f.venue_id, title: f.title.trim() || f.theme.trim() || "Sandlot playdate", theme: f.theme.trim(),
        target_bands: f.bands, starts_at: starts.toISOString(), ends_at: ends.toISOString(),
        capacity_kids: f.capacity, cost_note: f.cost.trim(), status: "published",
      });
      setF({ venue_id: f.venue_id, title: "", theme: "", starts: "", hours: 3, capacity: 24, cost: "", bands: [] });
      setAdding(false); await load(); flash("Meetup published 🎉");
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : "Couldn't create the meetup."); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="eyebrow first">Meetups</div>
      {!adding && <button className="btn btn-primary btn-block" onClick={() => setAdding(true)} style={{ marginBottom: 12 }}>+ Schedule a meetup</button>}
      {adding && (
        <form className="card" onSubmit={save} style={{ marginBottom: 12 }}>
          <div className="field"><label>Venue</label>
            {venues.length ? <select value={f.venue_id} onChange={(e) => setF({ ...f, venue_id: e.target.value })}>{venues.map((v) => <option key={v.id} value={v.id}>{v.name}{v.neighborhood ? ` · ${v.neighborhood}` : ""}</option>)}</select>
              : <p className="tiny muted" style={{ margin: 0 }}>No verified venues yet — add one in the Venues tab.</p>}</div>
          <div className="field"><label>Theme (what kids see)</label><input value={f.theme} onChange={(e) => setF({ ...f, theme: e.target.value })} placeholder="Retro Skate Jam 🛼" /></div>
          <div className="field"><label>Internal title (optional)</label><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="defaults to the theme" /></div>
          <div className="field"><label>Date &amp; start time</label><input type="datetime-local" value={f.starts} onChange={(e) => setF({ ...f, starts: e.target.value })} /></div>
          <div className="grid2">
            <div className="field"><label>Hours long</label><input type="number" min={1} max={8} value={f.hours} onChange={(e) => setF({ ...f, hours: parseInt(e.target.value, 10) || 3 })} /></div>
            <div className="field"><label>Kid capacity</label><input type="number" min={1} max={200} value={f.capacity} onChange={(e) => setF({ ...f, capacity: parseInt(e.target.value, 10) || 24 })} /></div>
          </div>
          <div className="field"><label>Age groups this meetup is for</label>
            <div className="chips">{bands.map((b) => { const on = f.bands.includes(b.code); return <button type="button" key={b.code} className={`chip ${on ? "on" : ""}`} onClick={() => setF({ ...f, bands: on ? f.bands.filter((x) => x !== b.code) : [...f.bands, b.code] })}>{b.label}</button>; })}</div></div>
          <div className="field"><label>Cost note (optional)</label><input value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} placeholder="Free · $3 skate rental at the door" /></div>
          {err && <p className="note note-sun" style={{ marginBottom: 12 }}>{err}</p>}
          <div className="grid2"><button type="button" className="btn btn-ghost" onClick={() => setAdding(false)}>Cancel</button><button className="btn btn-primary" disabled={busy}>{busy ? "…" : "Publish meetup"}</button></div>
        </form>
      )}
      {sessions.map((s) => (
        <MeetupCard key={s.id} s={s} onToggle={async () => { await adminSetSessionStatus(s.id, s.status === "published" ? "draft" : "published"); await load(); flash(s.status === "published" ? "Unpublished" : "Published"); }} />
      ))}
      {!sessions.length && <p className="muted small">No meetups yet.</p>}
    </>
  );
}

function MeetupCard({ s, onToggle }: { s: AdminSession; onToggle: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card" style={{ marginBottom: 8 }}>
      <button type="button" onClick={() => setOpen((o) => !o)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "none", border: 0, padding: 0, textAlign: "left", cursor: "pointer", color: "inherit" }}>
        <div style={{ flex: 1 }}>
          <b className="small">{s.theme || s.title}</b>
          <div className="tiny muted">{fmt(s.starts_at)} · {s.swaparound_venues?.name}</div>
        </div>
        <span className="chip chip-sky" style={{ padding: "4px 9px" }}>{s.status}</span>
        <span className="tiny" style={{ color: "var(--clover-deep)" }}>{open ? "Hide" : "Details →"}</span>
      </button>
      {open && (
        <div style={{ marginTop: 10, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
          <p className="small muted" style={{ margin: "0 0 8px" }}>
            Mode: {s.meetup_mode || "event"} · capacity {s.capacity_kids} · bands {(s.target_bands || []).join(", ") || "—"}
            {s.cost_note ? ` · ${s.cost_note}` : ""}
          </p>
          {s.swaparound_venues?.perk && <div className="note note-clover small">🎟️ {s.swaparound_venues.perk}</div>}
          <button className="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={onToggle}>
            {s.status === "published" ? "Unpublish meetup" : "Publish meetup"}
          </button>
        </div>
      )}
    </div>
  );
}

function Invites({ flash }: { flash: (m: string) => void }) {
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [f, setF] = useState({ code: "", label: "", cap: "" });
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => adminFetchInvites().then(setCodes).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!f.code.trim()) return; setBusy(true);
    try { await adminAddInvite(f.code, f.label, f.cap ? parseInt(f.cap, 10) : null); setF({ code: "", label: "", cap: "" }); await load(); flash("Invite code created ✓"); }
    catch { flash("That code already exists."); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="eyebrow first">Invite codes</div>
      <form className="card" onSubmit={save} style={{ marginBottom: 12 }}>
        <div className="grid2">
          <div className="field" style={{ marginBottom: 8 }}><label>New code</label><input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="church-friends" autoCapitalize="none" /></div>
          <div className="field" style={{ marginBottom: 8 }}><label>Max uses (blank = ∞)</label><input type="number" min={1} value={f.cap} onChange={(e) => setF({ ...f, cap: e.target.value })} placeholder="∞" /></div>
        </div>
        <div className="field"><label>Label (for you)</label><input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="Maya's class" /></div>
        <button className="btn btn-primary btn-block" disabled={busy || !f.code.trim()}>{busy ? "…" : "Create code"}</button>
      </form>
      {codes.map((c) => (
        <InviteCard key={c.code} c={c} onToggle={async () => { await adminSetInviteActive(c.code, !c.active); await load(); flash(c.active ? "Code off" : "Code on"); }} />
      ))}
    </>
  );
}

function InviteCard({ c, onToggle }: { c: InviteCode; onToggle: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card" style={{ marginBottom: 8 }}>
      <button type="button" onClick={() => setOpen((o) => !o)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "none", border: 0, padding: 0, textAlign: "left", cursor: "pointer", color: "inherit" }}>
        <div style={{ flex: 1 }}>
          <b className="small" style={{ fontFamily: "var(--fm)" }}>{c.code}</b>
          <div className="tiny muted">{c.label || "—"} · used {c.used_count}{c.max_uses ? ` / ${c.max_uses}` : ""}</div>
        </div>
        <span className="chip" style={{ padding: "4px 9px", background: c.active ? "var(--clover-soft)" : "var(--paper-2)", color: c.active ? "var(--clover-deep)" : "var(--ink-faint)", borderColor: "transparent" }}>{c.active ? "active" : "off"}</span>
        <span className="tiny" style={{ color: "var(--clover-deep)" }}>{open ? "Hide" : "Details →"}</span>
      </button>
      {open && (
        <div style={{ marginTop: 10, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
          <p className="small muted" style={{ margin: "0 0 8px" }}>Created {fmt(c.created_at)} · {c.active ? "Families can redeem this code" : "Redemption disabled"}</p>
          <button className="btn btn-ghost btn-block" onClick={onToggle}>{c.active ? "Turn off" : "Turn on"}</button>
        </div>
      )}
    </div>
  );
}
