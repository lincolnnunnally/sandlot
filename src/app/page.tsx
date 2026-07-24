"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import {
  addChild, addListing, blockParent, fetchAgeBands, fetchBlocks, fetchChildren, fetchHostVenues,
  fetchListings, fetchMyRsvp, fetchParent, fetchSessions, hostCreateSession, onboardParent, saveRsvp,
  submitReport, unblockParent, isAdmin, updateChildInterests, addFacility,
  ensureMyCode, redeemCode, sessionCounts, sessionAttendees, sessionRoster,
  requestConnection, acceptConnection, dismissConnection, myFamilies, checkinTicket,
  myCircles, createCircle, addToCircle, removeFromCircle, deleteCircle, myInvitedSessionIds,
  myTrades,
  KID_AVATARS, REPORT_REASONS, TOY_CATEGORIES, TOY_CONDITIONS, TOY_EMOJI, VENUE_TYPES,
  type AgeBand, type Block, type Child, type Listing, type Parent, type ReportTargetType,
  type RsvpInfo, type SessionRow, type SessionCounts, type Attendee, type RosterFamily, type FamilyLink,
  type CheckinResult, type Circle, type HostVenue, type TradeRow,
} from "@/lib/db";
import { MarketplaceSection } from "@/components/Marketplace";
import { GrowSandlotCard } from "@/components/Growth";
import { KidsToysDashboard } from "@/components/KidsToys";
import { ParentOrchestrator, VenueMapCard } from "@/components/ParentOrchestrator";

type ParentNav = "home" | "meetups" | "swaps" | "family" | "more";

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }); }
  catch { return iso; }
}
function fmtTime(iso: string) {
  try { return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); }
  catch { return ""; }
}

export default function Home() {
  const supa = getSupabase();
  const [ready, setReady] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [parent, setParent] = useState<Parent | null>(null);
  const [admin, setAdmin] = useState(false);
  const [toast, setToast] = useState("");

  const flash = useCallback((m: string) => { setToast(m); window.setTimeout(() => setToast(""), 2600); }, []);

  useEffect(() => {
    if (!supa) { setReady(true); return; }
    supa.auth.getSession().then(({ data }) => {
      setUid(data.session?.user.id ?? null);
      setEmail(data.session?.user.email ?? null);
      setReady(true);
    });
    const { data: sub } = supa.auth.onAuthStateChange((_e, session) => {
      setUid(session?.user.id ?? null);
      setEmail(session?.user.email ?? null);
      if (!session) setParent(null);
    });
    return () => sub.subscription.unsubscribe();
  }, [supa]);

  useEffect(() => {
    if (!uid) { setAdmin(false); return; }
    fetchParent(uid).then(setParent).catch(() => {});
    isAdmin(uid).then(setAdmin).catch(() => setAdmin(false));
  }, [uid]);

  if (!supa) return <Shell><div className="pad"><p className="muted">Sandlot isn&apos;t connected to its database yet.</p></div></Shell>;
  if (!ready) return <Shell><div className="pad muted">Loading…</div></Shell>;

  const inPortal = !!(uid && parent);

  return (
    <Shell signedIn={!!uid} admin={admin} parentNav={inPortal} onSignOut={async () => { await supa.auth.signOut(); }}>
      {admin && uid && (
        <a href="/admin" style={{ display: "block", margin: "12px 16px 0", padding: "10px 14px", borderRadius: 10, background: "var(--sunshine-soft)", color: "var(--sunshine-ink)", fontSize: ".82rem", fontWeight: 600, textDecoration: "none", textAlign: "center" }}>
          🛟 You&apos;re the owner — open your console (insights, meetups, safety) →
        </a>
      )}
      {!uid ? (
        <AuthScreen onFlash={flash} />
      ) : !parent ? (
        <Onboarding uid={uid} email={email} onDone={(p) => setParent(p)} onFlash={flash} />
      ) : (
        <Dashboard uid={uid} parent={parent} onFlash={flash} />
      )}
      {toast && <div className="toast">{toast}</div>}
    </Shell>
  );
}

function Shell({ children, signedIn, admin, onSignOut, parentNav }: {
  children: React.ReactNode; signedIn?: boolean; admin?: boolean; onSignOut?: () => void; parentNav?: boolean;
}) {
  return (
    <div className={`shell${parentNav ? " has-parent-nav" : ""}`}>
      <div className="bar">
        <div className="brand"><div className="mark">🛝</div><b>Sandlot</b></div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {admin && <a className="btn btn-primary" style={{ padding: "8px 10px", fontSize: ".78rem", textDecoration: "none" }} href="/admin">Owner</a>}
          {!parentNav && <a className="btn btn-ghost" style={{ padding: "8px 10px", fontSize: ".78rem", textDecoration: "none" }} href="/venue">Venue</a>}
          {signedIn && <button className="btn btn-ghost" style={{ padding: "8px 10px", fontSize: ".78rem" }} onClick={onSignOut}>Sign out</button>}
        </div>
      </div>
      {children}
      {!parentNav && (
        <footer className="foot">
          <a href="/terms">Terms</a><span>·</span>
          <a href="/privacy">Privacy</a><span>·</span>
          <span>A United Under God app</span>
        </footer>
      )}
    </div>
  );
}

/* ----------------------------------- AUTH ---------------------------------- */
function AuthScreen({ onFlash }: { onFlash: (m: string) => void }) {
  const supa = getSupabase()!;
  const [mode, setMode] = useState<"up" | "in">("up");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [hp, setHp] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [forgot, setForgot] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function requestReset(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      await fetch("/api/reset/request", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      // Always succeeds from the user's view — no account enumeration.
      setResetSent(true);
    } catch {
      setResetSent(true);
    } finally {
      setBusy(false);
    }
  }

  async function signIn(em: string, pw: string) {
    const { error } = await supa.auth.signInWithPassword({ email: em, password: pw });
    if (error) throw new Error(error.message);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (mode === "up" && !agree) {
      setErr("Please confirm you're 18+ and the parent/guardian, and agree to the Terms and Privacy Policy.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "up") {
        const res = await fetch("/api/signup", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, hp }),
        });
        const data = await res.json();
        if (data.error) { setErr(data.error); return; }
        // created OR already-exists → sign in with the given password (identity adoption)
        await signIn(email, password);
      } else {
        await signIn(email, password);
      }
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pad">
      <div className="hero-card" style={{ marginTop: 8 }}>
        <div style={{ fontFamily: "var(--fd)", fontWeight: 800, fontSize: "1.5rem" }}>Fidget trading, toys &amp; playdates.</div>
        <p className="small" style={{ opacity: .95, margin: "8px 0 0" }}>
          Trade fidgets and other toys, then hang out at supervised playdates with families nearby. Parents stay in charge — kids swap, play, and make friends.
        </p>
      </div>

      <div className="eyebrow">{forgot ? "Reset your password" : mode === "up" ? "Create your parent account" : "Welcome back"}</div>
      <div className="card">
        {forgot ? (
          resetSent ? (
            <>
              <p className="note note-clover small" style={{ marginTop: 0 }}>If an account exists for <b>{email || "that email"}</b>, we&apos;ve emailed a link to reset your password. It expires in 30 minutes — check your inbox (and spam).</p>
              <button className="btn btn-ghost btn-block" onClick={() => { setForgot(false); setResetSent(false); }}>Back to sign in</button>
            </>
          ) : (
            <form onSubmit={requestReset}>
              <p className="small muted" style={{ margin: "0 0 14px" }}>Enter your email and we&apos;ll send you a link to choose a new password.</p>
              <div className="field"><label htmlFor="rem">Your email</label>
                <input id="rem" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></div>
              {err && <p className="note note-sun" style={{ marginBottom: 12 }}>{err}</p>}
              <button className="btn btn-primary btn-block" disabled={busy || !email.includes("@")}>{busy ? "Sending…" : "Send reset link"}</button>
              <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={() => { setForgot(false); setErr(""); }}>Cancel</button>
            </form>
          )
        ) : (
          <>
            <div className="chips" style={{ marginBottom: 14 }}>
              <button className={`chip ${mode === "up" ? "on" : ""}`} onClick={() => setMode("up")} type="button">I&apos;m new</button>
              <button className={`chip ${mode === "in" ? "on" : ""}`} onClick={() => setMode("in")} type="button">I have an account</button>
            </div>
            <form onSubmit={submit}>
              <div className="field"><label htmlFor="em">Your email</label>
                <input id="em" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></div>
              <div className="field"><label htmlFor="pw">Password</label>
                <input id="pw" type="password" autoComplete={mode === "up" ? "new-password" : "current-password"} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" /></div>
              <input type="text" value={hp} onChange={(e) => setHp(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1 }} />
              {mode === "up" && (
                <label className="note note-clover" style={{ alignItems: "flex-start", cursor: "pointer", marginBottom: 12 }}>
                  <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ width: 18, height: 18, marginTop: 1, flex: "0 0 auto" }} />
                  <span>I&apos;m 18 or older and the parent/guardian setting up this account. I agree to Sandlot&apos;s{" "}
                    <a href="/terms" target="_blank" rel="noopener noreferrer">Terms</a> and{" "}
                    <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.</span>
                </label>
              )}
              {err && <p className="note note-sun" style={{ marginBottom: 12 }}>{err}</p>}
              <button className="btn btn-primary btn-block" disabled={busy || (mode === "up" && !agree)}>{busy ? "One moment…" : mode === "up" ? "Create account" : "Sign in"}</button>
            </form>
            {mode === "in" && (
              <p style={{ textAlign: "center", margin: "12px 0 0" }}>
                <button type="button" className="linkish" onClick={() => { setForgot(true); setErr(""); }}>Forgot your password?</button>
              </p>
            )}
            <p className="tiny muted" style={{ margin: "12px 0 0", textAlign: "center" }}>
              Parents only — kids don&apos;t get logins. We never ask for a child&apos;s last name, birthday, photo, or address.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/* -------------------------------- ONBOARDING ------------------------------- */
function Onboarding({ uid, email, onDone, onFlash }: { uid: string; email: string | null; onDone: (p: Parent) => void; onFlash: (m: string) => void }) {
  const [name, setName] = useState("");
  const [zip, setZip] = useState("");
  const [invite, setInvite] = useState("");
  const [fromFriend, setFromFriend] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Pick up a personal invite code from a /join/[code] link (stored) or ?invite=.
  useEffect(() => {
    let code = "";
    try {
      code = window.localStorage.getItem("sandlot_pending_code")
        || window.localStorage.getItem("swaparound_pending_code")
        || "";
    } catch {}
    if (!code) {
      const q = new URLSearchParams(window.location.search).get("invite");
      if (q) code = q;
    }
    if (code) { setInvite(code); setFromFriend(true); }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      await onboardParent(name.trim(), zip.trim(), invite.trim());
      try {
        window.localStorage.removeItem("sandlot_pending_code");
        window.localStorage.removeItem("swaparound_pending_code");
      } catch {}
      const p = await fetchParent(uid);
      if (p) { onDone(p); onFlash(fromFriend ? "You're in — and connected! 🛝" : "Welcome to Sandlot! 🛝"); }
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Couldn't save your profile.");
    } finally { setBusy(false); }
  }

  return (
    <div className="pad">
      <div className="eyebrow first">One quick thing</div>
      <div className="card">
        <h2 style={{ fontSize: "1.2rem" }}>So other parents know who to greet</h2>
        <p className="small muted" style={{ margin: "4px 0 14px" }}>Signed in as {email}. Just your name and zip so we can show meetups near you — never a street address.</p>
        {fromFriend && <div className="note note-clover small" style={{ marginBottom: 12 }}>🤝 A friend invited you — you&apos;ll be connected to their family automatically once you finish.</div>}
        <form onSubmit={submit}>
          <div className="field"><label htmlFor="nm">Your name</label>
            <input id="nm" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dana R." maxLength={40} /></div>
          <div className="field"><label htmlFor="zp">Your zip code</label>
            <input id="zp" required inputMode="numeric" value={zip} onChange={(e) => setZip(e.target.value)} placeholder="e.g. 30040" maxLength={10} /></div>
          {!fromFriend && (
            <div className="field"><label htmlFor="iv">Invite code from a friend <span className="muted">(optional)</span></label>
              <input id="iv" value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="only if someone shared one" maxLength={40} autoCapitalize="none" />
              <p className="tiny muted" style={{ margin: "6px 0 0" }}>No code needed to join. If a friend shared their personal code, add it here and you&apos;ll start out connected.</p></div>
          )}
          {err && <p className="note note-sun" style={{ marginBottom: 12 }}>{err}</p>}
          <button className="btn btn-primary btn-block" disabled={busy || !name.trim() || zip.trim().length < 3}>{busy ? "Saving…" : "Continue"}</button>
        </form>
        <p className="tiny muted" style={{ margin: "12px 0 0", textAlign: "center" }}>
          You choose who sees your family. Other parents only see who&apos;s coming once you connect.
        </p>
      </div>
    </div>
  );
}

/* -------------------------------- DASHBOARD -------------------------------- */
function Dashboard({ uid, parent, onFlash }: { uid: string; parent: Parent; onFlash: (m: string) => void }) {
  const [bands, setBands] = useState<AgeBand[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [rsvps, setRsvps] = useState<Record<string, RsvpInfo>>({});
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [admin, setAdmin] = useState(false);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [familyTick, setFamilyTick] = useState(0);
  const [view, setView] = useState<"parent" | "kids">("parent");
  const [nav, setNav] = useState<ParentNav>("home");
  const [swapsTab, setSwapsTab] = useState<"browse" | "mine" | "trades">("trades");
  const [chosenPlace, setChosenPlace] = useState<{ id: string; name: string; neighborhood: string | null } | null>(null);
  const bumpFamilies = useCallback(() => setFamilyTick((t) => t + 1), []);

  const bandLabel = useCallback((code: string) => bands.find((b) => b.code === code)?.label || code, [bands]);

  const loadRsvps = useCallback(async (sess: SessionRow[]) => {
    const entries = await Promise.all(sess.map(async (s) => [s.id, await fetchMyRsvp(s.id, uid)] as const));
    setRsvps(Object.fromEntries(entries));
  }, [uid]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [b, c, s, adm, inv, t] = await Promise.all([
        fetchAgeBands(),
        fetchChildren(uid),
        fetchSessions(),
        isAdmin(uid),
        myInvitedSessionIds().catch(() => [] as string[]),
        myTrades().catch(() => [] as TradeRow[]),
      ]);
      setBands(b); setChildren(c); setSessions(s); setAdmin(adm); setInvited(new Set(inv)); setTrades(t);
      await loadRsvps(s);
    } finally { setLoading(false); }
  }, [uid, loadRsvps]);

  useEffect(() => { refresh(); }, [refresh]);

  const pendingSwaps = trades.filter((t) => t.status === "pending" && t.direction === "incoming");
  const openSwaps = trades.filter((t) => t.status === "pending" || t.status === "accepted");
  const upcoming = sessions
    .filter((s) => new Date(s.starts_at).getTime() > Date.now() - 2 * 3600_000)
    .slice(0, 8);

  function go(section: ParentNav, opts?: { swapsTab?: "browse" | "mine" | "trades" }) {
    if (opts?.swapsTab) setSwapsTab(opts.swapsTab);
    setNav(section);
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch { /* */ }
  }

  if (view === "kids") {
    return (
      <KidsToysDashboard
        parent={parent}
        kids={children}
        onFlash={onFlash}
        onBackToParent={() => setView("parent")}
      />
    );
  }

  const firstName = parent.display_name.split(" ")[0];

  return (
    <>
      <div className="pad">
        {nav === "home" && (
          <>
            <div className="section-head">
              <h2>Hi {firstName} 👋</h2>
              <p>What needs your attention — then plan the next hangout.</p>
            </div>

            {pendingSwaps.length > 0 && (
              <button type="button" className="attn-card" onClick={() => go("swaps", { swapsTab: "trades" })}>
                <span className="attn-ico">🤝</span>
                <span>
                  <span className="attn-title">
                    {pendingSwaps.length} swap request{pendingSwaps.length === 1 ? "" : "s"} waiting
                  </span>
                  <span className="attn-sub">
                    {pendingSwaps.slice(0, 2).map((t) => t.from_name).join(" · ")}
                    {pendingSwaps.length > 2 ? "…" : ""} — tap to respond
                  </span>
                </span>
              </button>
            )}

            {openSwaps.length > 0 && pendingSwaps.length === 0 && (
              <button type="button" className="attn-card" style={{ background: "var(--sky-soft)", color: "var(--sky-ink)", borderColor: "color-mix(in srgb, var(--sky) 30%, var(--line))" }} onClick={() => go("swaps", { swapsTab: "trades" })}>
                <span className="attn-ico">🔄</span>
                <span>
                  <span className="attn-title">{openSwaps.length} open swap{openSwaps.length === 1 ? "" : "s"}</span>
                  <span className="attn-sub">Accepted or pending trades — plan the handoff at a meetup</span>
                </span>
              </button>
            )}

            <div className="home-actions">
              <button type="button" className="home-action" onClick={() => go("meetups")}>
                <b>📅 Plan a meetup</b>
                <span>Park, playground, or group hangout</span>
              </button>
              <button type="button" className="home-action" onClick={() => go("swaps", { swapsTab: "trades" })}>
                <b>🤝 Swaps</b>
                <span>{pendingSwaps.length ? `${pendingSwaps.length} need a reply` : "Offers & your toys"}</span>
              </button>
              <button type="button" className="home-action" onClick={() => go("meetups")}>
                <b>🗺️ Find a park</b>
                <span>Meet free — no venue signup</span>
              </button>
              <button type="button" className="home-action" onClick={() => go("family")}>
                <b>👨‍👩‍👧 Family</b>
                <span>Kids, invites & circles</span>
              </button>
            </div>

            <div className="eyebrow first" style={{ marginTop: 8 }}>Upcoming meetups</div>
            {loading ? (
              <p className="muted small">Loading meetups…</p>
            ) : upcoming.length === 0 ? (
              <div className="card">
                <p className="small" style={{ margin: "0 0 10px" }}>
                  No upcoming playdates yet. Find a public park or host a quick meetup.
                </p>
                <button type="button" className="btn btn-primary btn-block" onClick={() => go("meetups")}>
                  Plan your first meetup
                </button>
              </div>
            ) : (
              upcoming.map((s) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  children={children}
                  rsvp={rsvps[s.id]}
                  bandLabel={bandLabel}
                  isAdmin={admin}
                  invited={invited.has(s.id)}
                  onRsvp={async (childIds, mode) => {
                    await saveRsvp(s.id, uid, childIds, mode);
                    await loadRsvps(sessions);
                    onFlash("You're going! 🎉");
                  }}
                  onFlash={onFlash}
                  uid={uid}
                  onChanged={refresh}
                  onConnectionChanged={bumpFamilies}
                />
              ))
            )}

            {sessions.length > upcoming.length && (
              <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={() => go("meetups")}>
                See all meetups & plan more →
              </button>
            )}
          </>
        )}

        {nav === "meetups" && (
          <>
            <div className="section-head">
              <h2>Meetups</h2>
              <p>Plan a hangout, find a park, RSVP to what&apos;s near you.</p>
            </div>

            <ParentOrchestrator
              uid={uid}
              defaultZip={parent.zip}
              defaultArea={parent.area_label}
              onCreated={refresh}
              onFlash={onFlash}
              preselectVenue={chosenPlace}
              onPreselectConsumed={() => setChosenPlace(null)}
            />
            <VenueMapCard
              uid={uid}
              defaultZip={parent.zip}
              defaultArea={parent.area_label}
              onFlash={onFlash}
              onPlaceChosen={(v) => setChosenPlace(v)}
            />

            <div className="eyebrow">All playdates</div>
            {loading ? (
              <p className="muted small">Loading…</p>
            ) : sessions.length === 0 ? (
              <div className="card">
                <p className="muted small" style={{ margin: 0 }}>
                  Nothing posted yet — use <b>Plan a meetup</b> above.
                </p>
              </div>
            ) : (
              sessions.map((s) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  children={children}
                  rsvp={rsvps[s.id]}
                  bandLabel={bandLabel}
                  isAdmin={admin}
                  invited={invited.has(s.id)}
                  onRsvp={async (childIds, mode) => {
                    await saveRsvp(s.id, uid, childIds, mode);
                    await loadRsvps(sessions);
                    onFlash("You're going! 🎉");
                  }}
                  onFlash={onFlash}
                  uid={uid}
                  onChanged={refresh}
                  onConnectionChanged={bumpFamilies}
                />
              ))
            )}
          </>
        )}

        {nav === "swaps" && (
          <>
            <div className="section-head">
              <h2>Swaps</h2>
              <p>Respond to offers first. List toys when you&apos;re ready — browsing is optional.</p>
            </div>
            <MarketplaceSection
              uid={uid}
              parent={parent}
              children={children}
              sessions={sessions}
              onFlash={onFlash}
              initialTab={swapsTab}
              compact
            />
          </>
        )}

        {nav === "family" && (
          <>
            <div className="section-head">
              <h2>Family</h2>
              <p>Kids on Sandlot, invites, and the families you trust.</p>
            </div>
            <KidsSection
              uid={uid}
              bands={bands}
              children={children}
              onChanged={async () => setChildren(await fetchChildren(uid))}
              onFlash={onFlash}
            />
            <InviteFamiliesCard onFlash={onFlash} />
            <FamiliesSection uid={uid} onFlash={onFlash} refreshKey={familyTick} onChanged={bumpFamilies} />
            <CirclesSection uid={uid} onFlash={onFlash} refreshKey={familyTick} />
          </>
        )}

        {nav === "more" && (
          <>
            <div className="section-head">
              <h2>More</h2>
              <p>Kids browser, growth, safety, and venue tools.</p>
            </div>
            <button type="button" className="btn btn-coral btn-block" style={{ marginBottom: 10 }} onClick={() => setView("kids")}>
              🧒 Open kids toy browser
            </button>
            <p className="tiny muted" style={{ margin: "0 0 14px" }}>
              Simple kid-facing browse of toys nearby — parents stay signed in.
            </p>
            <GrowSandlotCard onFlash={onFlash} />
            <SafetySection uid={uid} onFlash={onFlash} />
            <div className="card" style={{ marginTop: 12 }}>
              <b className="small">Venue partner?</b>
              <p className="tiny muted" style={{ margin: "6px 0 10px" }}>
                Rec centers and facilities manage days and discounts in the venue portal. Public parks don&apos;t need this.
              </p>
              <a className="btn btn-ghost btn-block" href="/venue" style={{ textDecoration: "none" }}>Open venue portal</a>
            </div>
            <p className="tiny muted" style={{ textAlign: "center", margin: "22px 8px 0" }}>
              <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · A United Under God app
            </p>
          </>
        )}
      </div>

      <nav className="parent-nav" aria-label="Parent portal">
        {(
          [
            { id: "home" as const, ico: "🏠", label: "Home", badge: pendingSwaps.length },
            { id: "meetups" as const, ico: "📅", label: "Meetups", badge: 0 },
            { id: "swaps" as const, ico: "🤝", label: "Swaps", badge: pendingSwaps.length },
            { id: "family" as const, ico: "👨‍👩‍👧", label: "Family", badge: 0 },
            { id: "more" as const, ico: "⋯", label: "More", badge: 0 },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            className={nav === item.id ? "on" : ""}
            onClick={() => go(item.id, item.id === "swaps" ? { swapsTab: "trades" } : undefined)}
            aria-current={nav === item.id ? "page" : undefined}
          >
            <span className="nav-ico">{item.ico}</span>
            {item.label}
            {item.badge > 0 ? <span className="nav-badge">{item.badge > 9 ? "9+" : item.badge}</span> : null}
          </button>
        ))}
      </nav>
    </>
  );
}

/* --------------------- COMMUNITY: INVITE + YOUR FAMILIES --------------------- */
function InviteFamiliesCard({ onFlash }: { onFlash: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const link = code ? `${typeof window !== "undefined" ? window.location.origin : ""}/join/${code}` : "";

  async function reveal() {
    setOpen(true);
    if (code) return;
    setBusy(true);
    try { setCode(await ensureMyCode()); } catch { onFlash("Couldn't load your invite link."); }
    finally { setBusy(false); }
  }

  async function share() {
    const nav = typeof navigator !== "undefined" ? navigator : undefined;
    const shareData = { title: "Sandlot", text: "Join me on Sandlot — trade fidgets and other toys, and set up supervised playdates with nearby families.", url: link };
    try {
      if (nav?.share) { await nav.share(shareData); return; }
      await nav?.clipboard?.writeText(link);
      onFlash("Invite link copied! 📋");
    } catch { /* user dismissed share sheet */ }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(link); onFlash("Invite link copied! 📋"); } catch {}
  }

  return (
    <>
      <div className="eyebrow">Invite families you know</div>
      {!open ? (
        <button className="btn btn-ghost btn-block" onClick={reveal}>🤝 Get my invite link</button>
      ) : (
        <div className="card">
          <p className="small" style={{ margin: "0 0 10px" }}>Share your personal link with parents you already know and trust. When they join, your families are <b>connected</b> — you&apos;ll see each other at meetups.</p>
          {busy || !code ? <p className="tiny muted" style={{ margin: 0 }}>Loading your link…</p> : (
            <>
              <div className="field"><label>Your invite link</label>
                <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} style={{ fontFamily: "var(--fm)", fontSize: ".8rem" }} /></div>
              <div className="grid2">
                <button className="btn btn-ghost" onClick={copy}>Copy link</button>
                <button className="btn btn-primary" onClick={share}>Share…</button>
              </div>
              <p className="tiny muted" style={{ margin: "10px 0 0" }}>Code: <b>{code}</b> · up to 15 families</p>
            </>
          )}
        </div>
      )}
    </>
  );
}

function FamiliesSection({ uid, onFlash, refreshKey, onChanged }: {
  uid: string; onFlash: (m: string) => void; refreshKey: number; onChanged: () => void;
}) {
  const [families, setFamilies] = useState<FamilyLink[]>([]);
  const [redeeming, setRedeeming] = useState(false);
  const [redeemVal, setRedeemVal] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => { myFamilies().then(setFamilies).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load, refreshKey]);

  const connected = families.filter((f) => f.status === "active");
  const incoming = families.filter((f) => f.direction === "incoming");
  const outgoing = families.filter((f) => f.direction === "outgoing");

  async function act(fn: () => Promise<unknown>, msg: string) {
    setBusy(true);
    try { await fn(); onFlash(msg); load(); onChanged(); } catch (e) { onFlash(e instanceof Error ? e.message : "Something went wrong."); }
    finally { setBusy(false); }
  }

  async function redeem(e: React.FormEvent) {
    e.preventDefault();
    if (!redeemVal.trim()) return;
    await act(async () => { await redeemCode(redeemVal.trim()); setRedeemVal(""); setRedeeming(false); }, "Connected! 🤝");
  }

  const nothing = families.length === 0;

  return (
    <>
      <div className="eyebrow">Your families</div>
      {incoming.length > 0 && (
        <div className="card" style={{ marginBottom: 10, borderColor: "var(--clover)" }}>
          <b className="small">Connection requests</b>
          {incoming.map((f) => (
            <div key={f.parent_id} className="kidrow" style={{ marginTop: 8 }}>
              <div className="av">👋</div>
              <div style={{ flex: 1 }}><div className="nm">{f.name}</div><div className="bd">wants to connect</div></div>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="mini-btn" disabled={busy} onClick={() => act(() => dismissConnection(f.parent_id), "Request dismissed.")}>Ignore</button>
                <button className="btn btn-primary" style={{ padding: "7px 12px", fontSize: ".8rem" }} disabled={busy} onClick={() => act(() => acceptConnection(f.parent_id), `You and ${f.name} are connected! 🤝`)}>Accept</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="card">
        {nothing ? (
          <p className="small muted" style={{ margin: 0 }}>You haven&apos;t connected with any families yet. Share your invite link above, or connect with families going to the same meetup.</p>
        ) : (
          <>
            {connected.length > 0 && <div style={{ marginBottom: outgoing.length ? 10 : 0 }}>
              <b className="small">Connected</b>
              {connected.map((f) => (
                <div key={f.parent_id} className="kidrow" style={{ marginTop: 8 }}>
                  <div className="av">🤝</div>
                  <div style={{ flex: 1 }}><div className="nm">{f.name}</div><div className="bd">You can see each other at meetups</div></div>
                </div>
              ))}
            </div>}
            {outgoing.length > 0 && <div>
              <b className="small">Requests you sent</b>
              {outgoing.map((f) => (
                <div key={f.parent_id} className="kidrow" style={{ marginTop: 8 }}>
                  <div className="av">⏳</div>
                  <div style={{ flex: 1 }}><div className="nm">{f.name}</div><div className="bd">waiting for them to accept</div></div>
                  <button className="mini-btn" disabled={busy} onClick={() => act(() => dismissConnection(f.parent_id), "Request canceled.")}>Cancel</button>
                </div>
              ))}
            </div>}
          </>
        )}
        {!redeeming ? (
          <button className="btn btn-ghost btn-block" style={{ marginTop: 12 }} onClick={() => setRedeeming(true)}>Have a friend&apos;s code?</button>
        ) : (
          <form onSubmit={redeem} style={{ marginTop: 12 }}>
            <div className="field"><label>Enter a family code</label>
              <input value={redeemVal} onChange={(e) => setRedeemVal(e.target.value)} placeholder="e.g. fam-1a2b3c4d" autoCapitalize="none" maxLength={40} /></div>
            <div className="grid2">
              <button type="button" className="btn btn-ghost" onClick={() => { setRedeeming(false); setRedeemVal(""); }}>Cancel</button>
              <button className="btn btn-primary" disabled={busy || !redeemVal.trim()}>{busy ? "…" : "Connect"}</button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}

function KidsSection({ uid, bands, children, onChanged, onFlash }: {
  uid: string; bands: AgeBand[]; children: Child[]; onChanged: () => Promise<void>; onFlash: (m: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [nick, setNick] = useState("");
  const [band, setBand] = useState("");
  const [avatar, setAvatar] = useState(KID_AVATARS[0]);
  const [interests, setInterests] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  const bandLabel = (code: string) => bands.find((b) => b.code === code)?.label || code;

  // Keep the "all ages on by default" behavior even if bands finish loading
  // after the Add form was opened.
  useEffect(() => {
    if (adding && bands.length && interests.length === 0) setInterests(bands.map((b) => b.code));
  }, [adding, bands, interests.length]);

  function openAdd() {
    // Default: happy to play with every age group — deselect any you'd rather skip.
    setInterests(bands.map((b) => b.code));
    setAdding(true);
  }
  function toggleInterest(code: string) {
    setInterests((cur) => (cur.includes(code) ? cur.filter((x) => x !== code) : [...cur, code]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!band) { setErr("Please pick your child's age group."); return; }
    if (!consent) { setErr("Please confirm you're this child's parent or guardian."); return; }
    setBusy(true);
    try {
      // A child is always open to their own age group.
      const interested = Array.from(new Set([band, ...interests]));
      await addChild(uid, nick.trim(), band, avatar, interested);
      setNick(""); setBand(""); setConsent(false); setInterests([]); setAdding(false);
      await onChanged();
      onFlash("Added! 🧸");
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : "Couldn't add your child."); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="eyebrow first">Your kids</div>
      {children.map((c) => {
        const plays = c.interested_bands && c.interested_bands.length ? c.interested_bands : [c.age_band_code];
        const playsLabel = plays.length >= bands.length ? "all ages" : plays.map(bandLabel).join(", ");
        return (
          <div key={c.id}>
            <div className="kidrow" style={{ marginBottom: 4 }}>
              <div className="av">{c.avatar || "🙂"}</div>
              <div style={{ flex: 1 }}>
                <div className="nm">{c.nickname}</div>
                <div className="bd">{bandLabel(c.age_band_code)} · plays with {playsLabel}</div>
              </div>
              <button className="mini-btn" onClick={() => setEditing(editing === c.id ? null : c.id)}>{editing === c.id ? "Close" : "Edit"}</button>
            </div>
            {editing === c.id && (
              <InterestsEditor child={c} bands={bands}
                onSave={async (b) => { await updateChildInterests(c.id, b); setEditing(null); await onChanged(); onFlash("Updated 🧸"); }} />
            )}
          </div>
        );
      })}
      {!adding ? (
        <button className="btn btn-ghost btn-block" style={{ marginTop: children.length ? 4 : 0 }} onClick={openAdd}>+ Add a child</button>
      ) : (
        <form className="card" onSubmit={submit} style={{ marginTop: 4 }}>
          <div className="field"><label>Nickname (first name is fine)</label>
            <input value={nick} onChange={(e) => setNick(e.target.value)} maxLength={24} required placeholder="e.g. Maya" /></div>
          <div className="field"><label>Their age group</label>
            <div className="chips">
              {bands.map((b) => <button key={b.code} type="button" className={`chip ${band === b.code ? "on" : ""}`} onClick={() => setBand(b.code)}>{b.label}</button>)}
            </div></div>
          <div className="field"><label>Which age groups is {nick.trim() || "your child"} happy to play with?</label>
            <p className="tiny muted" style={{ margin: "0 0 8px" }}>All ages are on by default — tap to turn any off (great for versatile kids, or to skip a group).</p>
            <div className="chips">
              {bands.map((b) => { const on = interests.includes(b.code); return <button type="button" key={b.code} className={`chip ${on ? "on" : ""}`} onClick={() => toggleInterest(b.code)}>{b.label}</button>; })}
            </div></div>
          <div className="field"><label>Pick an avatar</label>
            <div className="chips">
              {KID_AVATARS.map((a) => <button key={a} type="button" className={`chip ${avatar === a ? "on" : ""}`} style={{ fontSize: "1.1rem", padding: "6px 10px" }} onClick={() => setAvatar(a)}>{a}</button>)}
            </div></div>
          <label className="note note-clover" style={{ alignItems: "center", cursor: "pointer", marginBottom: 12 }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ width: 18, height: 18 }} />
            <span>I&apos;m this child&apos;s parent or guardian, and I give my consent to add them. Their profile stores only a nickname and age group.</span>
          </label>
          {err && <p className="note note-sun" style={{ marginBottom: 12 }}>{err}</p>}
          <div className="grid2">
            <button type="button" className="btn btn-ghost" onClick={() => { setAdding(false); setErr(""); }}>Cancel</button>
            <button className="btn btn-primary" disabled={busy || !nick.trim() || !band}>{busy ? "Adding…" : "Add child"}</button>
          </div>
        </form>
      )}
    </>
  );
}

function InterestsEditor({ child, bands, onSave }: { child: Child; bands: AgeBand[]; onSave: (b: string[]) => Promise<void> }) {
  const [sel, setSel] = useState<string[]>(child.interested_bands && child.interested_bands.length ? child.interested_bands : [child.age_band_code]);
  const [busy, setBusy] = useState(false);
  return (
    <div className="card" style={{ marginTop: 4, marginBottom: 8 }}>
      <div className="field"><label>Age groups {child.nickname} is happy to play with</label>
        <div className="chips">
          {bands.map((b) => { const on = sel.includes(b.code); return <button type="button" key={b.code} className={`chip ${on ? "on" : ""}`} onClick={() => setSel(on ? sel.filter((x) => x !== b.code) : [...sel, b.code])}>{b.label}</button>; })}
        </div></div>
      <button className="btn btn-primary btn-block" disabled={busy || sel.length === 0}
        onClick={async () => { setBusy(true); try { await onSave(Array.from(new Set([child.age_band_code, ...sel]))); } finally { setBusy(false); } }}>
        {busy ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

/* --------------------- CIRCLES: groups of connected families --------------------- */
function CirclesSection({ uid, onFlash, refreshKey }: { uid: string; onFlash: (m: string) => void; refreshKey: number }) {
  const [circles, setCircles] = useState<Circle[]>([]);
  const [families, setFamilies] = useState<FamilyLink[]>([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [c, f] = await Promise.all([myCircles().catch(() => []), myFamilies().catch(() => [])]);
    setCircles(c); setFamilies(f.filter((x) => x.status === "active"));
  }, []);
  useEffect(() => { if (open) load(); }, [open, load, refreshKey]);

  async function act(fn: () => Promise<unknown>, msg: string) {
    setBusy(true);
    try { await fn(); await load(); onFlash(msg); } catch (e) { onFlash(e instanceof Error ? e.message : "Something went wrong."); }
    finally { setBusy(false); }
  }

  const connectedCount = families.length;

  return (
    <>
      <div className="eyebrow">Your circles</div>
      {!open ? (
        <button className="btn btn-ghost btn-block" onClick={() => setOpen(true)}>💚 Manage circles of friends</button>
      ) : (
        <div className="card">
          <p className="small muted" style={{ margin: "0 0 12px" }}>Group families you&apos;re connected with into circles (school, church, neighbors) so you can invite a whole circle to a meetup at once.</p>

          {circles.map((c) => {
            const memberIds = new Set(c.members.map((m) => m.parent_id));
            const addable = families.filter((f) => !memberIds.has(f.parent_id));
            return (
              <div key={c.id} className="card" style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <b className="small">💚 {c.name}</b>
                  <button className="mini-btn" disabled={busy} onClick={() => act(() => deleteCircle(c.id), "Circle deleted.")}>Delete</button>
                </div>
                {c.members.length === 0
                  ? <p className="tiny muted" style={{ margin: "6px 0" }}>No families in this circle yet.</p>
                  : c.members.map((m) => (
                    <div key={m.parent_id} className="kidrow" style={{ marginTop: 6 }}>
                      <div className="av">🤝</div>
                      <div style={{ flex: 1 }}><div className="nm small">{m.name}</div></div>
                      <button className="mini-btn" disabled={busy} onClick={() => act(() => removeFromCircle(c.id, m.parent_id), "Removed.")}>Remove</button>
                    </div>
                  ))}
                {addable.length > 0 && (
                  <select className="" style={{ marginTop: 8 }} value="" disabled={busy}
                    onChange={(e) => { const pid = e.target.value; if (pid) act(() => addToCircle(c.id, pid), "Added to circle. 💚"); }}>
                    <option value="">+ Add a connected family…</option>
                    {addable.map((f) => <option key={f.parent_id} value={f.parent_id}>{f.name}</option>)}
                  </select>
                )}
              </div>
            );
          })}

          {connectedCount === 0 && circles.length === 0 && (
            <p className="tiny muted" style={{ margin: "0 0 12px" }}>Connect with a few families first (via your invite link or at a meetup), then group them into circles here.</p>
          )}

          {!creating ? (
            <button className="btn btn-ghost btn-block" onClick={() => setCreating(true)}>+ New circle</button>
          ) : (
            <div className="field" style={{ marginBottom: 0 }}>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Circle name — e.g. Church friends" maxLength={40} />
              <div className="grid2" style={{ marginTop: 8 }}>
                <button className="btn btn-ghost" disabled={busy} onClick={() => { setCreating(false); setName(""); }}>Cancel</button>
                <button className="btn btn-primary" disabled={busy || !name.trim()}
                  onClick={() => act(async () => { await createCircle(uid, name.trim()); setName(""); setCreating(false); }, "Circle created 💚")}>Create</button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function HostSection({ uid, bands, onCreated, onFlash }: { uid: string; bands: AgeBand[]; onCreated: () => Promise<void>; onFlash: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [venues, setVenues] = useState<HostVenue[]>([]);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [f, setF] = useState({ venue_id: "", theme: "", starts: "", hours: 3, capacity: 20, cost: "", bands: [] as string[], groupIds: [] as string[] });
  const [addingVenue, setAddingVenue] = useState(false);
  const [commit, setCommit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function openForm() {
    setOpen(true);
    try {
      const [v, c] = await Promise.all([fetchHostVenues(), myCircles()]);
      setVenues(v); setCircles(c);
      setF((cur) => ({ ...cur, venue_id: cur.venue_id || v[0]?.id || "" }));
    } catch {}
  }

  function venueLabel(v: HostVenue) {
    return `${v.name}${v.neighborhood ? ` · ${v.neighborhood}` : ""}${v.status === "community" ? " (community-added)" : ""}`;
  }

  async function onVenueAdded(v: HostVenue) {
    setVenues((cur) => [...cur, v]);
    setF((cur) => ({ ...cur, venue_id: v.id }));
    setAddingVenue(false);
    onFlash("Place added — you can host here now. 📍");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    if (!f.venue_id) { setErr("Pick a place, or add one below."); return; }
    if (!f.starts) { setErr("Pick a date & time."); return; }
    if (!f.bands.length) { setErr("Pick at least one age group."); return; }
    if (!commit) { setErr("Please agree to the host promise below."); return; }
    setBusy(true);
    try {
      const starts = new Date(f.starts);
      const ends = new Date(starts.getTime() + f.hours * 3600 * 1000);
      await hostCreateSession(uid, {
        venue_id: f.venue_id, theme: f.theme.trim(), starts_at: starts.toISOString(), ends_at: ends.toISOString(),
        target_bands: f.bands, capacity_kids: f.capacity, cost_note: f.cost.trim(), groupIds: f.groupIds,
      });
      setF({ venue_id: f.venue_id, theme: "", starts: "", hours: 3, capacity: 20, cost: "", bands: [], groupIds: [] });
      setCommit(false); setOpen(false); await onCreated(); onFlash("Your playdate is live! 🎉");
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : "Couldn't create the playdate."); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="eyebrow">Host a playdate / swap</div>
      {!open ? (
        <button className="btn btn-ghost btn-block" onClick={openForm}>+ Host a playdate or toy swap</button>
      ) : (
        <form className="card" onSubmit={save}>
          <p className="tiny muted" style={{ margin: "0 0 12px" }}>Pick a place and a time for a playdate and fidget/toy swap — families can RSVP. You&apos;re the grown-up in charge.</p>
          <div className="field"><label>Where</label>
            {venues.length ? <select value={f.venue_id} onChange={(e) => setF({ ...f, venue_id: e.target.value })}>{venues.map((v) => <option key={v.id} value={v.id}>{venueLabel(v)}</option>)}</select>
              : <p className="tiny muted" style={{ margin: 0 }}>No places yet — add one below.</p>}
            {!addingVenue
              ? <button type="button" className="linkish" style={{ marginTop: 6 }} onClick={() => setAddingVenue(true)}>+ Add a new place</button>
              : <AddFacility uid={uid} onAdded={onVenueAdded} onCancel={() => setAddingVenue(false)} />}
          </div>
          <div className="field"><label>What&apos;s it called?</label><input value={f.theme} onChange={(e) => setF({ ...f, theme: e.target.value })} placeholder="e.g. Fidget Swap & Playdate" maxLength={40} required /></div>
          <div className="field"><label>Date &amp; start time</label><input type="datetime-local" value={f.starts} onChange={(e) => setF({ ...f, starts: e.target.value })} /></div>
          <div className="grid2">
            <div className="field"><label>Hours long</label><input type="number" min={1} max={8} value={f.hours} onChange={(e) => setF({ ...f, hours: parseInt(e.target.value, 10) || 3 })} /></div>
            <div className="field"><label>Kid capacity</label><input type="number" min={1} max={200} value={f.capacity} onChange={(e) => setF({ ...f, capacity: parseInt(e.target.value, 10) || 20 })} /></div>
          </div>
          <div className="field"><label>Age groups it&apos;s for</label>
            <div className="chips">{bands.map((b) => { const on = f.bands.includes(b.code); return <button type="button" key={b.code} className={`chip ${on ? "on" : ""}`} onClick={() => setF({ ...f, bands: on ? f.bands.filter((x) => x !== b.code) : [...f.bands, b.code] })}>{b.label}</button>; })}</div></div>
          {circles.length > 0 && (
            <div className="field"><label>Invite your circles (optional)</label>
              <p className="tiny muted" style={{ margin: "0 0 8px" }}>Families in these circles will see it highlighted as invited.</p>
              <div className="chips">{circles.map((c) => { const on = f.groupIds.includes(c.id); return <button type="button" key={c.id} className={`chip ${on ? "on" : ""}`} onClick={() => setF({ ...f, groupIds: on ? f.groupIds.filter((x) => x !== c.id) : [...f.groupIds, c.id] })}>💚 {c.name}</button>; })}</div></div>
          )}
          <div className="field"><label>Cost note (optional)</label><input value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} placeholder="Free" maxLength={60} /></div>
          <label className="note note-clover" style={{ alignItems: "center", cursor: "pointer", marginBottom: 12 }}>
            <input type="checkbox" checked={commit} onChange={(e) => setCommit(e.target.checked)} style={{ width: 18, height: 18 }} />
            <span>I&apos;ll be there to supervise, keep it to 1 grown-up per 6 kids, and follow the safety rules.</span>
          </label>
          {err && <p className="note note-sun" style={{ marginBottom: 12 }}>{err}</p>}
          <div className="grid2"><button type="button" className="btn btn-ghost" onClick={() => { setOpen(false); setErr(""); }}>Cancel</button><button className="btn btn-primary" disabled={busy}>{busy ? "…" : "Post my playdate"}</button></div>
        </form>
      )}
    </>
  );
}

// Parents add a public, supervised facility. Safety floor: an explicit
// attestation that it's a public, non-home space; it's saved as 'community'
// (labeled, reportable, admin-pausable) — never as an admin-'verified' place.
function AddFacility({ uid, onAdded, onCancel }: { uid: string; onAdded: (v: HostVenue) => void; onCancel: () => void }) {
  const [v, setV] = useState({ name: "", venue_type: VENUE_TYPES[0].code, neighborhood: "", address: "", perk: "" });
  const [attest, setAttest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function add() {
    setErr("");
    if (!v.name.trim()) { setErr("Give the place a name."); return; }
    if (v.address.trim().length < 6) { setErr("Please add the full address of this public place."); return; }
    if (!attest) { setErr("Please confirm this is a public, supervised space — not a home."); return; }
    setBusy(true);
    try { onAdded(await addFacility(uid, v)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't add that place."); }
    finally { setBusy(false); }
  }

  return (
    <div className="card" style={{ marginTop: 8, borderColor: "var(--sky)" }}>
      <b className="small">Add a place</b>
      <p className="tiny muted" style={{ margin: "4px 0 10px" }}>A public, supervised space open to the community — a church hall, rec center, library, park pavilion, gym. Never a private home. Until the owner verifies it, your meetup here is labeled &ldquo;not verified&rdquo; and families stay on-site (no drop-off).</p>
      <div className="field"><label>Name</label><input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="e.g. Grace Church Fellowship Hall" maxLength={60} /></div>
      <div className="field"><label>Type</label>
        <select value={v.venue_type} onChange={(e) => setV({ ...v, venue_type: e.target.value })}>{VENUE_TYPES.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}</select></div>
      <div className="field"><label>Full address</label><input value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} placeholder="e.g. 123 Main St, Cumming GA 30040" maxLength={140} />
        <p className="tiny muted" style={{ margin: "6px 0 0" }}>Shared with the owner for review and with families who RSVP — so everyone knows it&apos;s a real public place.</p></div>
      <div className="field"><label>Area / neighborhood</label><input value={v.neighborhood} onChange={(e) => setV({ ...v, neighborhood: e.target.value })} placeholder="e.g. Eastside · Cumming" maxLength={60} /></div>
      <label className="note note-clover" style={{ alignItems: "flex-start", cursor: "pointer", marginBottom: 12 }}>
        <input type="checkbox" checked={attest} onChange={(e) => setAttest(e.target.checked)} style={{ width: 18, height: 18, marginTop: 1, flex: "0 0 auto" }} />
        <span>This is a <b>public, supervised space</b> open to the community — not a private home. I understand meetups here are visible to families, address-listed, and reviewed by Sandlot.</span>
      </label>
      {err && <p className="note note-sun" style={{ marginBottom: 10 }}>{err}</p>}
      <div className="grid2">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={add}>{busy ? "Adding…" : "Add place"}</button>
      </div>
    </div>
  );
}

function SessionCard({ session, children, rsvp, bandLabel, isAdmin: admin, invited, onRsvp, onFlash, uid, onChanged, onConnectionChanged }: {
  session: SessionRow; children: Child[]; rsvp: RsvpInfo; bandLabel: (c: string) => string; isAdmin: boolean; invited: boolean;
  onRsvp: (childIds: string[], mode: string) => Promise<void>; onFlash: (m: string) => void; uid: string;
  onChanged: () => Promise<void>; onConnectionChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>(rsvp?.child_ids ?? []);
  const [mode, setMode] = useState(rsvp?.attendance_mode ?? "staying");
  const [busy, setBusy] = useState(false);
  const [board, setBoard] = useState(false);
  const [reporting, setReporting] = useState(false);
  const venue = session.swaparound_venues;
  // A child fits a meetup if it targets any age group they're in OR happy to play with.
  const eligible = children.filter((c) => {
    if (session.target_bands.length === 0) return true;
    const openTo = new Set([c.age_band_code, ...(c.interested_bands || [])]);
    return session.target_bands.some((b) => openTo.has(b));
  });
  const hostIsSomeoneElse = !!session.host_id && session.host_id !== uid;
  const canCheckIn = session.host_id === uid || admin;
  const communityVenue = venue?.status === "community";
  const swapsToys = !!session.swaps_toys;

  async function shareSession() {
    const url = `${typeof window !== "undefined" ? window.location.origin : ""}/m/${session.id}`;
    const nav = typeof navigator !== "undefined" ? navigator : undefined;
    const data = { title: "Sandlot playdate", text: `Join us: ${session.theme || session.title}`, url };
    try {
      if (nav?.share) { await nav.share(data); return; }
      await nav?.clipboard?.writeText(url);
      onFlash("Link copied! 📋");
    } catch { /* dismissed */ }
  }

  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
        <div style={{ fontFamily: "var(--fm)", fontSize: ".68rem", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink-soft)" }}>{fmtDate(session.starts_at)} · {fmtTime(session.starts_at)}</div>
        <div style={{ display: "flex", gap: 5 }}>
          {invited && !rsvp && session.host_id !== uid && <span style={{ fontFamily: "var(--fm)", fontSize: ".6rem", padding: "2px 7px", borderRadius: 5, background: "var(--clover-soft)", color: "var(--clover-deep)", textTransform: "uppercase" }}>💚 Invited</span>}
          {session.host_id === uid && <span style={{ fontFamily: "var(--fm)", fontSize: ".6rem", padding: "2px 7px", borderRadius: 5, background: "var(--sunshine-soft)", color: "var(--sunshine-ink)", textTransform: "uppercase" }}>You&apos;re hosting</span>}
          {rsvp && <span style={{ fontFamily: "var(--fm)", fontSize: ".6rem", padding: "2px 7px", borderRadius: 5, background: "var(--clover-soft)", color: "var(--clover-deep)", textTransform: "uppercase" }}>You&apos;re going</span>}
        </div>
      </div>
      <h3 style={{ fontSize: "1.08rem", margin: "3px 0 1px" }}>{session.theme || session.title}</h3>
      {session.meetup_mode && session.meetup_mode !== "event" && (
        <div className="tiny" style={{ color: "var(--clover-deep)", marginBottom: 2 }}>
          {session.meetup_mode === "playground" ? "🌳 Playground"
            : session.meetup_mode === "group" ? "💚 Circle meetup"
              : session.meetup_mode === "one_on_one" ? "🤝 One-on-one"
                : null}
        </div>
      )}
      {swapsToys && <div className="tiny" style={{ color: "var(--clover-deep)", marginBottom: 2 }}>🤝 Toy swap playdate</div>}
      <div className="small muted">{venue?.name}{venue?.neighborhood ? ` · ${venue.neighborhood}` : ""}</div>
      {communityVenue && <div className="note note-sun small" style={{ marginTop: 8 }}>ℹ️ Community-added place — <b>not yet verified</b> by Sandlot. Parents stay on-site here (no drop-off). Meet in the open and use ⚐ report if anything feels off.</div>}
      <div className="chips" style={{ marginTop: 8 }}>
        {session.target_bands.map((b) => <span key={b} className="chip chip-sky">{bandLabel(b)}</span>)}
      </div>
      {venue?.perk && <div className="note note-clover small" style={{ marginTop: 10 }}>🎁 Meetup promo: {venue.perk}</div>}
      {(venue as { services_discount?: string | null } | null | undefined)?.services_discount && (
        <div className="note note-sky small" style={{ marginTop: 8 }}>
          🏷️ Venue service discount: {(venue as { services_discount?: string }).services_discount}
        </div>
      )}

      <WhoIsComing sessionId={session.id} rsvped={!!rsvp} refreshKey={rsvp?.child_ids.length ?? 0} />

      {rsvp && (
        <>
          <TicketCard rsvp={rsvp} />
          <FamiliesGoing sessionId={session.id} onFlash={onFlash} onConnectionChanged={onConnectionChanged} />
        </>
      )}
      {canCheckIn && <CheckinPanel sessionId={session.id} onFlash={onFlash} />}

      {!open ? (
        <>
          <div className="grid2" style={{ marginTop: 12 }}>
            <button className="btn btn-primary" onClick={() => setOpen(true)}>{rsvp ? "Edit RSVP" : "RSVP"}</button>
            <button className="btn btn-ghost" onClick={shareSession}>🔗 Share / invite</button>
          </div>
          {swapsToys && (
            <button className="btn btn-ghost btn-block" style={{ marginTop: 8 }} disabled={!rsvp} onClick={() => setBoard((v) => !v)}>{board ? "Hide swap board" : rsvp ? "🤝 Toy swap board" : "🤝 RSVP to see the swap board"}</button>
          )}
        </>
      ) : (
        <div style={{ marginTop: 12 }}>
          <div className="field"><label>Who are you bringing?</label>
            {eligible.length === 0 ? <p className="tiny muted" style={{ margin: 0 }}>None of your kids are in this meetup&apos;s age group yet. Add a child in the right group above.</p> :
              eligible.map((c) => {
                const on = picked.includes(c.id);
                return <label key={c.id} className="kidrow" style={{ marginBottom: 6, cursor: "pointer" }}>
                  <div className="av">{c.avatar || "🙂"}</div>
                  <div style={{ flex: 1 }}><div className="nm">{c.nickname}</div><div className="bd">{bandLabel(c.age_band_code)}</div></div>
                  <input type="checkbox" checked={on} style={{ width: 20, height: 20 }} onChange={(e) => setPicked((p) => e.target.checked ? [...p, c.id] : p.filter((x) => x !== c.id))} />
                </label>;
              })}
          </div>
          <div className="field"><label>Will you stay or drop off?</label>
            {communityVenue ? (
              <p className="tiny muted" style={{ margin: 0 }}>A grown-up stays on-site at community-added places. Drop-off is only for owner-verified venues.</p>
            ) : (
              <div className="chips">
                <button type="button" className={`chip ${mode === "staying" ? "on" : ""}`} onClick={() => setMode("staying")}>I&apos;ll stay on-site</button>
                <button type="button" className={`chip ${mode === "dropping" ? "on" : ""}`} onClick={() => setMode("dropping")}>I&apos;m dropping off</button>
              </div>
            )}
          </div>
          <div className="grid2">
            <button className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn btn-primary" disabled={busy || picked.length === 0}
              onClick={async () => { setBusy(true); try { await onRsvp(picked, communityVenue ? "staying" : mode); setOpen(false); } finally { setBusy(false); } }}>
              {busy ? "Saving…" : "Confirm"}
            </button>
          </div>
        </div>
      )}

      {board && rsvp && <SwapBoard session={session} rsvp={rsvp} children={children} uid={uid} onFlash={onFlash} />}

      <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
        <button className="linkish" type="button" onClick={() => setReporting((v) => !v)}>{reporting ? "Close" : "⚐ Report or block"}</button>
      </div>
      {reporting && (
        <ReportPanel
          uid={uid}
          targetType="session"
          targetId={session.id}
          subjectParentId={hostIsSomeoneElse ? session.host_id : null}
          targetLabel={`Meetup: ${session.theme || session.title}${venue?.name ? " @ " + venue.name : ""}`}
          canBlock={hostIsSomeoneElse}
          onDone={() => setReporting(false)}
          onFlash={onFlash}
          onBlocked={onChanged}
        />
      )}
    </div>
  );
}

/* who's coming — aggregate counts every family (incl. strangers) can see */
function WhoIsComing({ sessionId, rsvped, refreshKey }: { sessionId: string; rsvped: boolean; refreshKey: number }) {
  const [counts, setCounts] = useState<SessionCounts | null>(null);
  useEffect(() => { sessionCounts(sessionId).then(setCounts).catch(() => {}); }, [sessionId, refreshKey]);
  if (!counts) return null;
  const { families, kids } = counts;
  return (
    <div className="note note-sky small" style={{ marginTop: 10 }}>
      {families === 0
        ? <>✨ No RSVPs yet — {rsvped ? "you're the first family!" : "be the first family to RSVP."}</>
        : <>👨‍👩‍👧 <b>{families}</b> {families === 1 ? "family" : "families"} · <b>{kids}</b> {kids === 1 ? "kid" : "kids"} going{!rsvped && " — RSVP to see who you know"}</>}
    </div>
  );
}

/* the parent's door ticket for an RSVP */
function TicketCard({ rsvp }: { rsvp: NonNullable<RsvpInfo> }) {
  if (!rsvp.ticket_code) return null;
  const checked = !!rsvp.checked_in_at;
  return (
    <div className="card" style={{ marginTop: 10, borderStyle: "dashed", borderColor: "var(--clover)", background: "var(--clover-soft)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div>
          <div className="tiny muted" style={{ textTransform: "uppercase", letterSpacing: ".05em" }}>🎟️ Your door ticket</div>
          <div style={{ fontFamily: "var(--fm)", fontSize: "1.35rem", fontWeight: 800, letterSpacing: ".04em" }}>{rsvp.ticket_code}</div>
        </div>
        {checked
          ? <span className="chip" style={{ background: "var(--clover)", color: "#fff" }}>✓ Checked in</span>
          : <span className="tiny muted" style={{ textAlign: "right", maxWidth: 130 }}>Show this at the door with your kids</span>}
      </div>
    </div>
  );
}

/* families going — connect (request/accept); connected families show their kids */
function FamiliesGoing({ sessionId, onFlash, onConnectionChanged }: {
  sessionId: string; onFlash: (m: string) => void; onConnectionChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [roster, setRoster] = useState<RosterFamily[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const [a, r] = await Promise.all([sessionAttendees(sessionId), sessionRoster(sessionId)]); setAttendees(a); setRoster(r); }
    finally { setLoading(false); }
  }, [sessionId]);
  useEffect(() => { if (open) load(); }, [open, load]);

  const kidsOf = useCallback((pid: string) => roster.find((f) => f.parent_id === pid)?.kids ?? [], [roster]);

  async function act(pid: string, fn: () => Promise<unknown>, msg: string) {
    setBusyId(pid);
    try { await fn(); onFlash(msg); await load(); onConnectionChanged(); }
    catch (e) { onFlash(e instanceof Error ? e.message : "Something went wrong."); }
    finally { setBusyId(null); }
  }

  return (
    <div style={{ marginTop: 10 }}>
      {!open ? (
        <button className="btn btn-ghost btn-block" onClick={() => setOpen(true)}>👋 See who&apos;s going &amp; connect</button>
      ) : (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <b className="small">Families going</b>
            <button className="linkish" type="button" onClick={() => setOpen(false)}>Hide</button>
          </div>
          {loading ? <p className="tiny muted" style={{ margin: 0 }}>Loading…</p>
            : attendees.length === 0 ? <p className="tiny muted" style={{ margin: 0 }}>No other families have RSVP&apos;d yet. You&apos;ll see them here as they join.</p>
            : attendees.map((a) => {
              const kids = kidsOf(a.parent_id);
              return (
                <div key={a.parent_id} className="kidrow" style={{ marginTop: 8, alignItems: "flex-start" }}>
                  <div className="av">{a.state === "connected" ? "🤝" : "🙂"}</div>
                  <div style={{ flex: 1 }}>
                    <div className="nm">{a.name}</div>
                    {a.state === "connected"
                      ? <div className="bd">{kids.length ? kids.map((k) => `${k.avatar || "🧒"} ${k.nickname}`).join(" · ") : "Connected"}</div>
                      : <div className="bd">Connect to see who they&apos;re bringing</div>}
                  </div>
                  {a.state === "none" && <button className="btn btn-primary" style={{ padding: "7px 12px", fontSize: ".8rem" }} disabled={busyId === a.parent_id} onClick={() => act(a.parent_id, () => requestConnection(a.parent_id), `Request sent to ${a.name} 👋`)}>Connect</button>}
                  {a.state === "outgoing" && <span className="chip" style={{ fontSize: ".72rem" }}>Requested</span>}
                  {a.state === "incoming" && <button className="btn btn-primary" style={{ padding: "7px 12px", fontSize: ".8rem" }} disabled={busyId === a.parent_id} onClick={() => act(a.parent_id, () => acceptConnection(a.parent_id), `You and ${a.name} are connected! 🤝`)}>Accept</button>}
                </div>
              );
            })}
          <p className="tiny muted" style={{ marginTop: 10 }}>You only see a family&apos;s kids once you&apos;re connected. Connecting is mutual — either of you can start it.</p>
        </div>
      )}
    </div>
  );
}

/* host / admin door check-in: verify a ticket -> family + their kids */
function CheckinPanel({ sessionId, onFlash }: { sessionId: string; onFlash: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckinResult | null>(null);
  const [err, setErr] = useState("");

  async function check(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setResult(null); setBusy(true);
    try { setResult(await checkinTicket(sessionId, code.trim())); }
    catch (e2) { setErr(e2 instanceof Error ? e2.message : "Couldn't check that ticket."); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ marginTop: 10 }}>
      {!open ? (
        <button className="btn btn-ghost btn-block" onClick={() => setOpen(true)}>🎟️ Check families in at the door</button>
      ) : (
        <div className="card" style={{ borderColor: "var(--sunshine)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <b className="small">Door check-in</b>
            <button className="linkish" type="button" onClick={() => { setOpen(false); setResult(null); setErr(""); setCode(""); }}>Close</button>
          </div>
          <p className="tiny muted" style={{ margin: "0 0 10px" }}>Ask each family for their ticket code. Their kids should match who shows up — an adult with no kids on the ticket doesn&apos;t belong.</p>
          <form onSubmit={check}>
            <div className="field"><input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="SWAP-XXXXX" autoCapitalize="characters" maxLength={12} style={{ fontFamily: "var(--fm)", letterSpacing: ".05em" }} /></div>
            <button className="btn btn-primary btn-block" disabled={busy || !code.trim()}>{busy ? "Checking…" : "Check this ticket"}</button>
          </form>
          {err && <p className="note note-sun" style={{ marginTop: 10, marginBottom: 0 }}>{err}</p>}
          {result && (
            <div className="note" style={{ marginTop: 10, background: result.kids.length ? "var(--clover-soft)" : "var(--coral-soft)", borderColor: result.kids.length ? "var(--clover)" : "var(--coral)" }}>
              <div style={{ fontWeight: 700 }}>{result.kids.length ? "✅" : "⚠️"} {result.family}{result.already ? " (already checked in)" : ""}</div>
              <div className="small" style={{ marginTop: 4 }}>
                {result.kids.length
                  ? <>Bringing: {result.kids.map((k) => `${k.avatar || "🧒"} ${k.nickname}`).join(" · ")} · {result.mode === "dropping" ? "drop-off" : "staying"}</>
                  : <b>No kids on this ticket — do not admit.</b>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SwapBoard({ session, rsvp, children, uid, onFlash }: {
  session: SessionRow; rsvp: RsvpInfo; children: Child[]; uid: string; onFlash: (m: string) => void;
}) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [reportListing, setReportListing] = useState<Listing | null>(null);
  const myKids = children.filter((c) => rsvp?.child_ids.includes(c.id));

  const load = useCallback(async () => { setLoading(true); try { setListings(await fetchListings(session.id)); } finally { setLoading(false); } }, [session.id]);
  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ marginTop: 14, borderTop: "1px dashed var(--line)", paddingTop: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <b className="small">Playdate swap board</b>
        {!adding && myKids.length > 0 && <button className="btn btn-coral" style={{ padding: "7px 12px", fontSize: ".8rem" }} onClick={() => setAdding(true)}>+ Add a toy</button>}
      </div>
      <p className="tiny muted" style={{ margin: "0 0 10px" }}>Toys for this playdate. Full search &amp; trade offers live in the marketplace above.</p>
      {adding && <AddToy sessionId={session.id} uid={uid} myKids={myKids} onDone={async () => { setAdding(false); await load(); onFlash("Added to the board! 🫧"); }} onCancel={() => setAdding(false)} />}
      {loading ? <p className="tiny muted">Loading…</p>
        : listings.length === 0 ? <p className="tiny muted">No toys on this playdate board yet. Add one, or list on the marketplace.</p>
        : <div className="grid2">
            {listings.map((l) => (
              <div className="toy" key={l.id}>
                <div className="ph">{l.emoji || "🧸"}<span className="to">{l.category || "toy"}</span></div>
                <div className="bd2">
                  <div className="nm2">{l.toy_name}</div>
                  {l.wants && <div className="wt">wants: {l.wants}</div>}
                  {l.status !== "available" && <div className="ow">{l.status}</div>}
                  {l.parent_id !== uid && <button className="linkish" type="button" style={{ marginTop: 6 }} onClick={() => setReportListing(l)}>⚐ report</button>}
                </div>
              </div>
            ))}
          </div>}
      {reportListing && (
        <ReportPanel
          uid={uid}
          targetType="listing"
          targetId={reportListing.id}
          subjectParentId={reportListing.parent_id !== uid ? reportListing.parent_id : null}
          targetLabel={`Toy: ${reportListing.toy_name}`}
          canBlock={reportListing.parent_id !== uid}
          onDone={() => setReportListing(null)}
          onFlash={onFlash}
          onBlocked={load}
        />
      )}
      <p className="tiny muted" style={{ marginTop: 10 }}>Trades happen in person at the meetup, with grown-ups there. Nothing gets shipped.</p>
    </div>
  );
}

function AddToy({ sessionId, uid, myKids, onDone, onCancel }: {
  sessionId: string; uid: string; myKids: Child[]; onDone: () => Promise<void>; onCancel: () => void;
}) {
  const [childId, setChildId] = useState(myKids[0]?.id ?? "");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("fidget");
  const [condition, setCondition] = useState("great");
  const [emoji, setEmoji] = useState("🌀");
  const [wants, setWants] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      await addListing({ sessionId, childId, uid, toyName: name.trim(), category, condition, wants: wants.trim(), emoji });
      await onDone();
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : "Couldn't add the toy."); }
    finally { setBusy(false); }
  }

  return (
    <form className="card" onSubmit={submit} style={{ marginBottom: 12 }}>
      <div className="note note-sky small" style={{ marginBottom: 12 }}>Icons only — never photos of kids. Toys listed here also show on the marketplace when available.</div>
      <div className="field"><label>Whose toy?</label>
        <select value={childId} onChange={(e) => setChildId(e.target.value)}>{myKids.map((c) => <option key={c.id} value={c.id}>{c.nickname}</option>)}</select></div>
      <div className="field"><label>Pick an icon</label>
        <div className="chips">{TOY_EMOJI.map((x) => <button key={x} type="button" className={`chip ${emoji === x ? "on" : ""}`} style={{ fontSize: "1.1rem", padding: "6px 10px" }} onClick={() => setEmoji(x)}>{x}</button>)}</div></div>
      <div className="field"><label>What is it?</label>
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} placeholder="e.g. Galaxy pop-it" /></div>
      <div className="field"><label>Type</label>
        <div className="chips">{TOY_CATEGORIES.map((c) => <button key={c.code} type="button" className={`chip ${category === c.code ? "on" : ""}`} onClick={() => setCategory(c.code)}>{c.label}</button>)}</div></div>
      <div className="field"><label>Condition</label>
        <div className="chips">{TOY_CONDITIONS.map((c) => <button key={c.code} type="button" className={`chip ${condition === c.code ? "on" : ""}`} onClick={() => setCondition(c.code)}>{c.label}</button>)}</div></div>
      <div className="field"><label>What would you love in return? (optional)</label>
        <input value={wants} onChange={(e) => setWants(e.target.value)} maxLength={80} placeholder="a mini Rubik's cube… or surprise me!" /></div>
      {err && <p className="note note-sun" style={{ marginBottom: 12 }}>{err}</p>}
      <div className="grid2">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-coral" disabled={busy || !name.trim() || !childId}>{busy ? "Adding…" : "Add to board"}</button>
      </div>
    </form>
  );
}

/* ------------------------------ SAFETY: REPORT + BLOCK ------------------------------ */
function ReportPanel({ uid, targetType, targetId, subjectParentId, targetLabel, canBlock, onDone, onFlash, onBlocked }: {
  uid: string; targetType: ReportTargetType; targetId?: string | null; subjectParentId?: string | null;
  targetLabel?: string | null; canBlock?: boolean; onDone: () => void; onFlash: (m: string) => void; onBlocked?: () => void | Promise<void>;
}) {
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function send() {
    setErr(""); setBusy(true);
    try {
      await submitReport(uid, { targetType, targetId, subjectParentId, targetLabel, reason, details });
      onFlash("Thanks — your report went to our team. 🛟");
      onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't send the report."); }
    finally { setBusy(false); }
  }

  async function block() {
    if (!subjectParentId) return;
    setErr(""); setBusy(true);
    try {
      await blockParent(uid, subjectParentId, targetLabel || "Blocked family");
      onFlash("Blocked. You won't see each other's meetups or toys.");
      await onBlocked?.();
      onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't block."); }
    finally { setBusy(false); }
  }

  return (
    <div className="card" style={{ marginTop: 10, borderColor: "var(--coral)" }}>
      <b className="small">{targetLabel ? `Report — ${targetLabel}` : "Report a concern"}</b>
      <p className="tiny muted" style={{ margin: "4px 0 10px" }}>A real person on our team reviews every report. In an emergency, call 911 first.</p>
      <div className="field"><label>What&apos;s wrong?</label>
        <select value={reason} onChange={(e) => setReason(e.target.value)}>{REPORT_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}</select></div>
      <div className="field"><label>Anything else? (optional)</label>
        <textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={2000} rows={3} placeholder="Tell us what happened…" /></div>
      {err && <p className="note note-sun" style={{ marginBottom: 12 }}>{err}</p>}
      <div className="grid2">
        <button type="button" className="btn btn-ghost" onClick={onDone} disabled={busy}>Cancel</button>
        <button type="button" className="btn btn-coral" onClick={send} disabled={busy}>{busy ? "Sending…" : "Send report"}</button>
      </div>
      {canBlock && subjectParentId && subjectParentId !== uid && (
        <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={block} disabled={busy}>
          🚫 Block this family — hide us from each other
        </button>
      )}
    </div>
  );
}

function SafetySection({ uid, onFlash }: { uid: string; onFlash: (m: string) => void }) {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [reporting, setReporting] = useState(false);
  const load = useCallback(() => fetchBlocks(uid).then(setBlocks).catch(() => {}), [uid]);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="eyebrow">Safety</div>
      <div className="card">
        <p className="small" style={{ margin: 0 }}>See something that worries you? Tell us — a real person reviews every report. In an emergency, call 911 first.</p>
        {!reporting
          ? <button className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={() => setReporting(true)}>⚐ Report a safety concern</button>
          : <ReportPanel uid={uid} targetType="general" targetLabel="General safety concern" onDone={() => setReporting(false)} onFlash={onFlash} />}
      </div>
      {blocks.length > 0 && (
        <div className="card" style={{ marginTop: 10 }}>
          <b className="small">People you&apos;ve blocked</b>
          <p className="tiny muted" style={{ margin: "4px 0 8px" }}>You won&apos;t see each other&apos;s meetups or toys.</p>
          {blocks.map((b) => (
            <div key={b.id} className="kidrow" style={{ marginBottom: 6 }}>
              <div style={{ flex: 1 }}><div className="nm small">{b.label || "Blocked family"}</div></div>
              <button className="mini-btn" onClick={async () => { await unblockParent(uid, b.blocked_id); await load(); onFlash("Unblocked."); }}>Unblock</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
