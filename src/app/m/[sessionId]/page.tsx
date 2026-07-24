"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { publicSession, fetchAgeBands, type PublicSession, type AgeBand } from "@/lib/db";

// Public, shareable event page: /m/<sessionId>. Anyone with the link can see the
// playdate (no address or kid names) and open Sandlot to RSVP.
export default function MeetupPage() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const id = (params?.sessionId ?? "").toString();

  const [data, setData] = useState<PublicSession | undefined>(undefined);
  const [bands, setBands] = useState<AgeBand[]>([]);

  useEffect(() => {
    fetchAgeBands().then(setBands).catch(() => {});
    publicSession(id).then((d) => setData(d ?? null)).catch(() => setData(null));
  }, [id]);

  const bandLabel = (code: string) => bands.find((b) => b.code === code)?.label || code;
  const when = data ? new Date(data.starts_at) : null;
  const dateStr = when ? when.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : "";
  const timeStr = when ? when.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "";

  return (
    <div className="shell">
      <div className="bar"><div className="brand"><div className="mark">🛝</div><b>Sandlot</b></div></div>
      <div className="pad">
        {data === undefined ? (
          <p className="muted small">Loading…</p>
        ) : data === null ? (
          <div className="card">
            <h2 style={{ fontSize: "1.15rem", margin: "0 0 6px" }}>This playdate isn&apos;t available</h2>
            <p className="small muted" style={{ margin: "0 0 14px" }}>It may have been unpublished or the link is wrong.</p>
            <button className="btn btn-primary btn-block" onClick={() => router.push("/")}>Open Sandlot</button>
          </div>
        ) : (
          <>
            <div className="hero-card" style={{ marginTop: 8 }}>
              <div style={{ fontFamily: "var(--fd)", fontWeight: 800, fontSize: "1.4rem" }}>{data.title}</div>
              <p className="small" style={{ opacity: .95, margin: "8px 0 0" }}>
                You&apos;re invited to a Sandlot playdate. Open the app to RSVP and see who&apos;s going.
              </p>
            </div>

            <div className="card">
              <div className="kidrow" style={{ marginBottom: 6 }}>
                <div className="av">📅</div>
                <div style={{ flex: 1 }}><div className="nm">{dateStr}</div><div className="bd">{timeStr}</div></div>
              </div>
              <div className="kidrow" style={{ marginBottom: 6 }}>
                <div className="av">📍</div>
                <div style={{ flex: 1 }}><div className="nm">{data.venue || "Meeting place"}</div><div className="bd">{data.area || "Open the app for details"}{data.venue_status === "community" ? " · community place" : ""}</div></div>
              </div>
              {data.swaps_toys && (
                <div className="note note-clover small" style={{ marginTop: 8 }}>🤝 Kids will swap or trade toys at this playdate.</div>
              )}
              {data.bands?.length > 0 && (
                <div className="chips" style={{ marginTop: 10 }}>
                  {data.bands.map((b) => <span key={b} className="chip chip-sky">{bandLabel(b)}</span>)}
                </div>
              )}
              <div className="note note-sky small" style={{ marginTop: 10 }}>
                👨‍👩‍👧 {data.families} {data.families === 1 ? "family" : "families"} · {data.kids} {data.kids === 1 ? "kid" : "kids"} going{data.cost ? ` · ${data.cost}` : ""}
              </div>
              <button className="btn btn-primary btn-block" style={{ marginTop: 14 }} onClick={() => router.push("/")}>Open Sandlot to RSVP</button>
              <p className="tiny muted" style={{ margin: "12px 0 0", textAlign: "center" }}>
                Free to join. Parents are always in charge. We never ask for a child&apos;s last name, birthday, photo, or address.
              </p>
            </div>
          </>
        )}
      </div>
      <footer className="foot">
        <a href="/terms">Terms</a><span>·</span><a href="/privacy">Privacy</a><span>·</span><span>A United Under God app</span>
      </footer>
    </div>
  );
}
