import type { Metadata } from "next";
import { buildMapNavLinks } from "@/lib/mapNav";

export const metadata: Metadata = {
  title: "Apple Maps — Sandlot",
  description: "Open this park in Apple Maps.",
};

type Props = {
  searchParams: Promise<{ q?: string; ll?: string }> | { q?: string; ll?: string };
};

function parsePin(ll: string | undefined): { lat: number; lon: number } | null {
  if (!ll) return null;
  const [latRaw, lonRaw] = ll.split(",");
  const lat = Number(latRaw);
  const lon = Number(lonRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

function safeQuery(raw: string | undefined): string {
  const q = (raw ?? "").trim().slice(0, 200);
  if (!q) return "";
  const lower = q.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("data:") || lower === "about:blank") return "";
  return q;
}

export default async function AppleMapsDoor({ searchParams }: Props) {
  const sp = await Promise.resolve(searchParams);
  const q = safeQuery(typeof sp.q === "string" ? sp.q : "");
  const pin = parsePin(typeof sp.ll === "string" ? sp.ll : "");
  const lat = pin?.lat ?? 0;
  const lon = pin?.lon ?? 0;
  const links = buildMapNavLinks({
    lat,
    lon,
    name: q || null,
    displayAddress: q || null,
  });
  const appleHref = q ? links.appleMapsUrl : "https://maps.apple.com/?q=parks";
  const osmSrc = pin
    ? `https://www.openstreetmap.org/export/embed.html?marker=${encodeURIComponent(`${lat},${lon}`)}&bbox=${encodeURIComponent(
        `${lon - 0.012},${lat - 0.012},${lon + 0.012},${lat + 0.012}`,
      )}`
    : null;

  return (
    <div className="shell">
      <div className="bar">
        <div className="brand"><div className="mark">🛝</div><b>Sandlot</b></div>
        <a className="btn btn-ghost" style={{ padding: "8px 12px", fontSize: ".82rem" }} href="/">Back to app</a>
      </div>
      <div className="pad">
        <div className="card">
          <h1 style={{ fontSize: "1.35rem", margin: "0 0 8px" }}>🍎 Apple Maps</h1>
          <p className="small" style={{ margin: "0 0 12px" }}>
            {q ? <>Directions for <b>{q}</b></> : "Search parks in Apple Maps."}
          </p>
          {osmSrc && (
            <iframe
              title="Park map"
              src={osmSrc}
              style={{ width: "100%", height: 220, border: "1px solid var(--line)", borderRadius: 14 }}
            />
          )}
          <a className="btn btn-primary btn-block" style={{ marginTop: 12, textDecoration: "none" }} href={appleHref}>
            Continue to Apple Maps
          </a>
          <p className="tiny muted" style={{ margin: "10px 0 0" }}>
            Opens Apple Maps for this park. Use Google Maps on park details if you prefer that.
          </p>
        </div>
      </div>
    </div>
  );
}
