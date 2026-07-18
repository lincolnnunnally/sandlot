"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Map as LeafletMap, Marker as LeafletMarker } from "leaflet";
import { addFacility, fetchHostVenues, venuesMap, VENUE_TYPES, type AdminVenue } from "@/lib/db";
import { buildMapNavLinks } from "@/lib/mapNav";

export type MapPlace = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  kind: string;
  address: string | null;
  city: string | null;
  zip: string | null;
  displayAddress?: string | null;
  mapsUrl?: string;
  appleMapsUrl?: string;
  source: "overpass" | "nominatim" | "photon" | "sandlot" | "seed";
  sandlotVenueId?: string;
  perk?: string | null;
  services_discount?: string | null;
  status?: string;
  distanceMiles?: number;
  isPublicPark?: boolean;
  note?: string | null;
};

function navLinks(p: MapPlace) {
  // Always rebuild from address so we never use a bare park name (wrong city).
  const built = buildMapNavLinks({
    lat: p.lat,
    lon: p.lon,
    name: p.name,
    address: p.address,
    city: p.city,
    zip: p.zip,
    displayAddress: p.displayAddress,
  });
  return { maps: built.mapsUrl, apple: built.appleMapsUrl, label: built.queryLabel };
}

function placeLine(p: MapPlace): string {
  if (p.displayAddress) return p.displayAddress;
  const parts = [p.address, p.city, p.zip].filter(Boolean);
  if (parts.length) return parts.join(", ");
  return "";
}

type Props = {
  uid: string;
  defaultZip?: string | null;
  defaultArea?: string | null;
  onFlash: (m: string) => void;
  /** Called when user picks a Sandlot venue or adds a new place from the map */
  onPlaceReady?: (venue: { id: string; name: string; neighborhood: string | null }) => void;
  compact?: boolean;
};

const QUICK = [
  { q: "park", label: "🌳 Parks" },
  { q: "playground", label: "🛝 Playgrounds" },
  { q: "library", label: "📚 Libraries" },
];

function venueTypeFromKind(kind: string): string {
  if (kind === "playground" || kind === "park") return "park_pavilion";
  if (kind === "library") return "library";
  if (kind === "church_hall" || kind.includes("worship") || kind.includes("church")) return "church_hall";
  if (kind === "community_hall" || kind.includes("community")) return "community_hall";
  if (kind === "gym" || kind.includes("sport")) return "gym";
  return "other";
}

export function PlaceFinderMap({ uid, defaultZip, defaultArea, onFlash, onPlaceReady, compact }: Props) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<LeafletMarker[]>([]);
  const LRef = useRef<typeof import("leaflet") | null>(null);

  const [zip, setZip] = useState(defaultZip || defaultArea || "");
  const [query, setQuery] = useState("park");
  const [center, setCenter] = useState<{ lat: number; lon: number; label: string } | null>(null);
  const [places, setPlaces] = useState<MapPlace[]>([]);
  const [sandlot, setSandlot] = useState<AdminVenue[]>([]);
  const [selected, setSelected] = useState<MapPlace | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [mapReady, setMapReady] = useState(false);

  // Seed zip from parent profile
  useEffect(() => {
    if (!zip && (defaultZip || defaultArea)) setZip(defaultZip || defaultArea || "");
  }, [defaultZip, defaultArea, zip]);

  // Init Leaflet map once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!mapEl.current || mapRef.current) return;
      const L = await import("leaflet");
      // CSS
      if (typeof document !== "undefined" && !document.getElementById("leaflet-css")) {
        const link = document.createElement("link");
        link.id = "leaflet-css";
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }
      // Fix default marker icons in bundlers
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      if (cancelled || !mapEl.current) return;
      LRef.current = L;
      const map = L.map(mapEl.current, { zoomControl: true, attributionControl: true })
        .setView([33.75, -84.39], 11); // Atlanta-ish default until geocode
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      mapRef.current = map;
      setMapReady(true);
      setTimeout(() => map.invalidateSize(), 100);
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  const clearMarkers = useCallback(() => {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
  }, []);

  const paintMarkers = useCallback((list: MapPlace[], focus?: MapPlace | null) => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    clearMarkers();
    const bounds: [number, number][] = [];
    list.forEach((p) => {
      const isSel = focus?.id === p.id;
      const isSandlot = p.source === "sandlot";
      const marker = L.circleMarker([p.lat, p.lon], {
        radius: isSel ? 11 : 8,
        color: isSel ? "#0b7c52" : isSandlot ? "#2e9bd6" : "#0fa06b",
        fillColor: isSel ? "#0fa06b" : isSandlot ? "#5cb6e6" : "#34c088",
        fillOpacity: 0.9,
        weight: 2,
      })
        .addTo(map)
        .bindTooltip(p.name, { direction: "top", offset: [0, -6] });
      marker.on("click", () => setSelected(p));
      markersRef.current.push(marker as unknown as LeafletMarker);
      bounds.push([p.lat, p.lon]);
    });
    if (bounds.length) {
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 14 });
    }
    if (focus) {
      map.panTo([focus.lat, focus.lon]);
    }
  }, [clearMarkers]);

  const runSearch = useCallback(async (opts?: { q?: string; near?: string }) => {
    const q = (opts?.q ?? query).trim() || "park";
    const near = (opts?.near ?? zip).trim();
    if (!near) {
      setErr("Enter your zip or city so we can find parks near you.");
      return;
    }
    setLoading(true);
    setErr("");
    setSelected(null);
    try {
      const [searchRes, sandlotList] = await Promise.all([
        fetch(`/api/places/search?q=${encodeURIComponent(q)}&near=${encodeURIComponent(near)}&miles=15`).then(async (r) => {
          const j = await r.json();
          if (!r.ok) throw new Error(j.error || "Search failed");
          return j as {
            center: { lat: number; lon: number; label: string };
            places: MapPlace[];
            note?: string;
            counts?: { total?: number; seed?: number };
          };
        }),
        venuesMap().catch(() => [] as AdminVenue[]),
      ]);

      setCenter(searchRes.center);
      setSandlot(sandlotList.filter((x) => x.status === "verified" || x.status === "community"));

      // Public parks (seed + OSM) — no venue partner signup needed
      const merged = searchRes.places;
      setPlaces(merged);
      if (mapRef.current) {
        mapRef.current.setView([searchRes.center.lat, searchRes.center.lon], 12);
        paintMarkers(merged);
      }
      if (!merged.length) {
        setErr(`No parks found near ${near}. Try “Conyers, GA” or a park name like “Pine Log Park”.`);
      } else {
        setErr("");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Search failed.");
      onFlash(e instanceof Error ? e.message : "Map search failed.");
    } finally {
      setLoading(false);
      setTimeout(() => mapRef.current?.invalidateSize(), 50);
    }
  }, [query, zip, paintMarkers, onFlash]);

  // Auto-search when map is ready + we have a zip
  useEffect(() => {
    if (!mapReady) return;
    if (zip.trim().length >= 3) {
      runSearch({ q: "park", near: zip.trim() });
    }
    // only on map ready + initial zip
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady]);

  useEffect(() => {
    if (selected) paintMarkers(places, selected);
  }, [selected, places, paintMarkers]);

  const selectedIsSandlot = !!selected?.sandlotVenueId;

  async function useThisPlace() {
    if (!selected) return;
    setBusy(true);
    try {
      if (selected.sandlotVenueId) {
        onPlaceReady?.({
          id: selected.sandlotVenueId,
          name: selected.name,
          neighborhood: selected.city || selected.zip || zip || null,
        });
        onFlash(`Meeting at ${selected.name} ✓ — open Plan a meetup to set the time.`);
        return;
      }
      // Public parks: no venue partner signup. Reuse an existing meeting place by name
      // if someone already used this park, otherwise silently save as a public meeting spot.
      const existing = await fetchHostVenues().catch(() => [] as Awaited<ReturnType<typeof fetchHostVenues>>);
      const match = existing.find(
        (v) => v.name.trim().toLowerCase() === selected.name.trim().toLowerCase(),
      );
      if (match) {
        onPlaceReady?.({ id: match.id, name: match.name, neighborhood: match.neighborhood });
        onFlash(`Meeting at ${selected.name} (public park) ✓ — Plan a meetup to pick day & time.`);
        return;
      }
      const street = placeLine(selected) || selected.address || "";
      const v = await addFacility(uid, {
        name: selected.name.slice(0, 120),
        venue_type: venueTypeFromKind(selected.kind),
        neighborhood: selected.city || selected.zip || zip || "",
        address: street || "",
        perk: selected.isPublicPark || selected.source === "seed" ? "Public park — free to meet" : "",
      });
      onPlaceReady?.({ id: v.id, name: v.name, neighborhood: v.neighborhood });
      onFlash(`Public park set: ${selected.name}. No venue signup needed — Plan a meetup for the time.`);
    } catch (e) {
      onFlash(e instanceof Error ? e.message : "Couldn't use that place.");
    } finally {
      setBusy(false);
    }
  }

  const list = useMemo(() => {
    if (!selected) return places;
    // put selected first
    return [selected, ...places.filter((p) => p.id !== selected.id)];
  }, [places, selected]);

  return (
    <div className="place-finder">
      <p className="note note-clover small" style={{ marginBottom: 10 }}>
        <b>Public parks &amp; playgrounds</b> are free meeting spots — no venue partner signup.
        Enter your zip, search, tap a park for directions or <b>Meet here</b>.
      </p>
      <div className="field" style={{ marginBottom: 8 }}>
        <label htmlFor="map-zip">Near zip or city</label>
        <input
          id="map-zip"
          value={zip}
          onChange={(e) => setZip(e.target.value)}
          placeholder="e.g. 30012 or Conyers, GA"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); runSearch(); } }}
        />
      </div>
      <div className="field" style={{ marginBottom: 8 }}>
        <label htmlFor="map-q">Search parks &amp; playgrounds</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            id="map-q"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='“park”, “playground”, or “Wheeler Park”'
            style={{ flex: 1 }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); runSearch(); } }}
          />
          <button type="button" className="btn btn-primary" style={{ padding: "12px 14px" }} disabled={loading} onClick={() => runSearch()}>
            {loading ? "…" : "Search"}
          </button>
        </div>
      </div>
      <div className="chips" style={{ marginBottom: 10 }}>
        {QUICK.map((x) => (
          <button
            key={x.q}
            type="button"
            className={`chip ${query === x.q ? "on" : ""}`}
            onClick={() => { setQuery(x.q); runSearch({ q: x.q }); }}
          >
            {x.label}
          </button>
        ))}
      </div>

      {center && (
        <p className="tiny muted" style={{ margin: "0 0 8px" }}>
          Parks near <b>{center.label.split(",").slice(0, 3).join(",")}</b>
          {places.length ? ` · ${places.length} found` : ""}
          {loading ? " · searching…" : ""}
        </p>
      )}
      {err && <p className="note note-sun small" style={{ marginBottom: 8 }}>{err}</p>}

      <div
        ref={mapEl}
        className="place-map"
        style={{ height: compact ? 220 : 280, borderRadius: 14, border: "1px solid var(--line)", zIndex: 1 }}
      />

      {selected && (
        <div className="card" style={{ marginTop: 10, borderColor: "var(--clover)" }}>
          <b style={{ fontSize: "1.05rem" }}>{selected.name}</b>
          <div className="small" style={{ marginTop: 6, fontWeight: 600 }}>
            {placeLine(selected) || "Address on map pin"}
          </div>
          <div className="tiny muted" style={{ marginTop: 2 }}>
            Directions go to: {navLinks(selected).label}
          </div>
          <div className="tiny muted" style={{ marginTop: 4 }}>
            {selected.source === "sandlot"
              ? "Sandlot partner venue"
              : selected.isPublicPark || selected.source === "seed" || selected.kind === "park" || selected.kind === "playground"
                ? "🌳 Public park — free to meet (no signup)"
                : selected.kind}
            {selected.distanceMiles != null ? ` · ${selected.distanceMiles} mi` : ""}
          </div>
          {selected.note && <div className="tiny" style={{ marginTop: 4 }}>{selected.note}</div>}
          {selected.perk && <div className="tiny" style={{ color: "var(--clover-deep)", marginTop: 4 }}>🎟️ {selected.perk}</div>}
          {selected.services_discount && <div className="tiny" style={{ color: "var(--sky-ink)", marginTop: 2 }}>🏷️ {selected.services_discount}</div>}

          <div className="grid2" style={{ marginTop: 12 }}>
            <a
              className="btn btn-ghost btn-block"
              style={{ textDecoration: "none" }}
              href={navLinks(selected).maps}
              target="_blank"
              rel="noopener noreferrer"
            >
              🧭 Google Maps
            </a>
            <a
              className="btn btn-ghost btn-block"
              style={{ textDecoration: "none" }}
              href={navLinks(selected).apple}
              target="_blank"
              rel="noopener noreferrer"
            >
              🍎 Apple Maps
            </a>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-block"
            style={{ marginTop: 8 }}
            disabled={busy}
            onClick={useThisPlace}
          >
            {busy ? "…" : "Meet here (no venue signup)"}
          </button>
          <p className="tiny muted" style={{ margin: "8px 0 0" }}>
            Directions open in Maps. <b>Meet here</b> only saves this park so you can Plan a meetup time — it is not a business venue.
          </p>
        </div>
      )}

      {sandlot.length > 0 && (
        <>
          <p className="tiny muted" style={{ margin: "12px 0 6px" }}>Sandlot venues (tap to use)</p>
          <div style={{ maxHeight: 120, overflow: "auto", marginBottom: 8 }}>
            {sandlot.map((v) => (
              <button
                key={v.id}
                type="button"
                className="kidrow"
                style={{ width: "100%", marginBottom: 6, cursor: "pointer" }}
                onClick={() => {
                  setSelected({
                    id: `sandlot-${v.id}`,
                    name: v.name,
                    lat: center?.lat || 0,
                    lon: center?.lon || 0,
                    kind: v.venue_type,
                    address: v.address,
                    city: v.neighborhood,
                    zip: null,
                    source: "sandlot",
                    sandlotVenueId: v.id,
                    perk: v.perk,
                    services_discount: v.services_discount,
                    status: v.status,
                  });
                }}
              >
                <div className="av">🏟️</div>
                <div style={{ flex: 1, textAlign: "left" }}>
                  <div className="nm">{v.name}</div>
                  <div className="bd">
                    {VENUE_TYPES.find((t) => t.code === v.venue_type)?.label || v.venue_type}
                    {v.neighborhood ? ` · ${v.neighborhood}` : ""}
                    {v.status === "community" ? " · community" : " · verified"}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <p className="tiny muted" style={{ margin: "8px 0 6px" }}>
        Parks &amp; playgrounds — tap a row or pin
      </p>
      <div style={{ maxHeight: compact ? 180 : 260, overflow: "auto" }}>
        {loading && !places.length ? (
          <p className="muted small">Finding parks with playgrounds near you…</p>
        ) : list.map((p) => (
          <button
            key={p.id}
            type="button"
            className="kidrow"
            style={{
              width: "100%",
              marginBottom: 6,
              cursor: "pointer",
              border: selected?.id === p.id ? "1px solid var(--clover)" : undefined,
              background: selected?.id === p.id ? "var(--clover-soft)" : undefined,
            }}
            onClick={() => {
              setSelected(p);
              if (p.lat && p.lon) {
                mapRef.current?.panTo([p.lat, p.lon]);
                mapRef.current?.setZoom(Math.max(mapRef.current.getZoom(), 14));
              }
            }}
          >
            <div className="av">{p.kind === "playground" ? "🛝" : p.kind === "library" ? "📚" : "🌳"}</div>
            <div style={{ flex: 1, textAlign: "left" }}>
              <div className="nm">{p.name}</div>
              <div className="bd" style={{ fontWeight: 600, color: "var(--ink)" }}>
                {placeLine(p) || (p.distanceMiles != null ? `${p.distanceMiles} mi away` : "Tap for details")}
              </div>
              <div className="bd">
                {p.isPublicPark || p.source === "seed" ? "Public park" : p.kind}
                {p.distanceMiles != null ? ` · ${p.distanceMiles} mi` : ""}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
