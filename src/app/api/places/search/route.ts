import { NextRequest, NextResponse } from "next/server";
import { buildMapNavLinks } from "@/lib/mapNav";
import { seedParksNear, ZIP_TO_CITY, type SeedPark } from "@/lib/publicParks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UA = "SandlotMeetupFinder/1.0 (unitedundergod.org; family meetup app)";

export type PlaceResult = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  kind: string;
  address: string | null;
  city: string | null;
  zip: string | null;
  displayAddress: string | null;
  source: "photon" | "nominatim" | "overpass" | "sandlot" | "seed";
  mapsUrl: string;
  appleMapsUrl: string;
  distanceMiles: number;
  isPublicPark: boolean;
  note?: string | null;
};

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nav(opts: {
  lat: number;
  lon: number;
  name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  displayAddress?: string | null;
}) {
  const links = buildMapNavLinks(opts);
  return { mapsUrl: links.mapsUrl, appleMapsUrl: links.appleMapsUrl };
}

async function geocodeNear(near: string) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  const n = near.trim();
  const zip5 = /^\d{5}(-\d{4})?$/.test(n) ? n.slice(0, 5) : null;

  if (zip5) {
    url.searchParams.set("postalcode", zip5);
    url.searchParams.set("country", "USA");
  } else {
    url.searchParams.set("q", /usa|united states/i.test(n) ? n : `${n}, USA`);
    url.searchParams.set("countrycodes", "us");
  }
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": UA, Accept: "application/json" },
    next: { revalidate: 3600 },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as Array<{
    lat: string;
    lon: string;
    display_name: string;
    address?: Record<string, string>;
  }>;
  if (!data?.length) return null;
  const hit = data[0];
  const a = hit.address || {};
  let city = a.city || a.town || a.village || a.hamlet || null;
  const county = a.county || null;
  const state = a.state || null;
  const zip = a.postcode?.slice(0, 5) || zip5;

  // Zip geocodes often return only the county — map to principal city for park queries
  if ((!city || /county/i.test(city)) && zip && ZIP_TO_CITY[zip]) {
    city = ZIP_TO_CITY[zip].city;
  } else if ((!city || /county/i.test(city)) && /rockdale/i.test(county || "")) {
    city = "Conyers";
  }

  return {
    lat: parseFloat(hit.lat),
    lon: parseFloat(hit.lon),
    label: hit.display_name,
    city,
    county,
    state: state || (zip && ZIP_TO_CITY[zip]?.state) || null,
    zip,
  };
}

function isJunk(name: string, osmKey?: string, osmValue?: string): boolean {
  const n = name.toLowerCase().trim();
  const key = (osmKey || "").toLowerCase();
  const val = (osmValue || "").toLowerCase();
  if (!n || n.length < 3) return true;
  if (key === "highway" || key === "building" || key === "place" || key === "boundary") return true;
  if (val === "parking" || val === "bus_stop" || val === "residential" || val === "service" || val === "administrative") return true;
  if (/park\s*&\s*ride|park and ride|parking|high school|elementary|middle school|stadium/i.test(n)) return true;
  if (/^(park|playground|conyers|rockdale|georgia|united states)$/i.test(n)) return true;
  if (/county$/i.test(n) && !/park/i.test(n)) return true;
  if (/\b(street|road|drive|avenue|court|lane|way|circle|boulevard)\b/i.test(n) && !/\bpark\b/i.test(n)) return true;
  return false;
}

function isParkLike(osmKey?: string, osmValue?: string, name?: string): boolean {
  const key = (osmKey || "").toLowerCase();
  const val = (osmValue || "").toLowerCase();
  const n = (name || "").toLowerCase();
  if (key === "leisure" && ["park", "playground", "nature_reserve", "recreation_ground", "dog_park"].includes(val)) return true;
  if (key === "amenity" && (val === "library" || val === "community_centre")) return true;
  if (/\b(park|playground|greenway|recreation|rec center|splash)\b/i.test(n) && key !== "highway") return true;
  return false;
}

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: Record<string, string | number | undefined>;
};

function seedToPlace(p: SeedPark & { distanceMiles: number }): PlaceResult {
  const display = [p.address, p.city, p.state, p.zip].filter(Boolean).join(", ");
  const links = nav({
    lat: p.lat,
    lon: p.lon,
    name: p.name,
    address: p.address,
    city: p.city,
    state: p.state,
    zip: p.zip,
    displayAddress: display,
  });
  return {
    id: p.id,
    name: p.name,
    lat: p.lat,
    lon: p.lon,
    kind: p.kind,
    address: p.address,
    city: p.city,
    zip: p.zip,
    displayAddress: display,
    source: "seed",
    mapsUrl: links.mapsUrl,
    appleMapsUrl: links.appleMapsUrl,
    distanceMiles: p.distanceMiles,
    isPublicPark: true,
    note: p.note || null,
  };
}

/** Parallel Photon queries with strong local bias. */
async function photonSearch(
  queries: string[],
  lat: number,
  lon: number,
  maxMiles: number,
  allowLibraries: boolean,
): Promise<PlaceResult[]> {
  const seen = new Set<string>();
  const out: PlaceResult[] = [];

  const jobs = queries.slice(0, 6).map(async (q) => {
    try {
      const url = new URL("https://photon.komoot.io/api/");
      url.searchParams.set("q", q);
      url.searchParams.set("lat", String(lat));
      url.searchParams.set("lon", String(lon));
      url.searchParams.set("limit", "20");
      url.searchParams.set("lang", "en");
      url.searchParams.set("location_bias_scale", "0.15");

      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4500);
      const res = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
        signal: ctrl.signal,
      }).finally(() => clearTimeout(t));
      if (!res.ok) return [] as PlaceResult[];
      const data = (await res.json()) as { features?: PhotonFeature[] };
      const batch: PlaceResult[] = [];

      for (const f of data.features || []) {
        const p = f.properties;
        const [plon, plat] = f.geometry.coordinates;
        const name = String(p.name || "").trim();
        if (!name) continue;

        const osmKey = p.osm_key ? String(p.osm_key) : undefined;
        const osmValue = p.osm_value ? String(p.osm_value) : undefined;
        if (isJunk(name, osmKey, osmValue)) continue;
        if (!isParkLike(osmKey, osmValue, name)) continue;
        if (!allowLibraries && osmValue === "library") continue;

        const miles = haversineMiles(lat, lon, plat, plon);
        if (miles > maxMiles) continue;

        const street = p.street
          ? [p.housenumber, p.street].filter(Boolean).join(" ")
          : null;
        const city = (p.city as string) || (p.town as string) || (p.village as string) || null;
        const zip = p.postcode ? String(p.postcode).slice(0, 5) : null;
        const state = p.state ? String(p.state) : null;
        const display =
          [street, city, state, zip].filter(Boolean).join(", ") ||
          [city, state].filter(Boolean).join(", ") ||
          null;

        const kind =
          osmValue === "playground"
            ? "playground"
            : osmValue === "library"
              ? "library"
              : "park";

        const links = nav({
          lat: plat,
          lon: plon,
          name,
          address: street,
          city,
          state,
          zip,
          displayAddress: display,
        });
        batch.push({
          id: `photon-${p.osm_type || "x"}-${p.osm_id || `${plat}-${plon}`}`,
          name,
          lat: plat,
          lon: plon,
          kind,
          address: street,
          city,
          zip,
          displayAddress: display,
          source: "photon",
          mapsUrl: links.mapsUrl,
          appleMapsUrl: links.appleMapsUrl,
          distanceMiles: Math.round(miles * 10) / 10,
          isPublicPark: kind === "park" || kind === "playground",
        });
      }
      return batch;
    } catch {
      return [] as PlaceResult[];
    }
  });

  const batches = await Promise.all(jobs);
  for (const batch of batches) {
    for (const place of batch) {
      const key = `${place.name.toLowerCase().replace(/[^a-z0-9]+/g, "")}|${place.lat.toFixed(3)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(place);
    }
  }
  return out;
}

/** Nominatim — only for specific named park lookups. */
async function nominatimNameSearch(
  queries: string[],
  lat: number,
  lon: number,
  maxMiles: number,
): Promise<PlaceResult[]> {
  const out: PlaceResult[] = [];
  const seen = new Set<string>();

  // Sequential to respect Nominatim 1 req/s policy — keep to 2 queries max
  for (const q of queries.slice(0, 2)) {
    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("q", q);
      url.searchParams.set("format", "json");
      url.searchParams.set("limit", "8");
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("countrycodes", "us");

      const res = await fetch(url.toString(), {
        headers: { "User-Agent": UA, Accept: "application/json" },
      });
      if (!res.ok) continue;
      const data = (await res.json()) as Array<{
        place_id: number;
        lat: string;
        lon: string;
        display_name: string;
        name?: string;
        type?: string;
        class?: string;
        address?: Record<string, string>;
      }>;

      for (const hit of data) {
        const plat = parseFloat(hit.lat);
        const plon = parseFloat(hit.lon);
        const miles = haversineMiles(lat, lon, plat, plon);
        if (miles > maxMiles) continue;

        const name = (hit.name || hit.display_name.split(",")[0] || "").trim();
        if (!name || isJunk(name, hit.class, hit.type)) continue;
        if (!isParkLike(hit.class, hit.type, name) && !/park|playground|library/i.test(name)) continue;

        const id = `nom-${hit.place_id}`;
        if (seen.has(id)) continue;
        seen.add(id);

        const a = hit.address || {};
        const street = [a.house_number, a.road].filter(Boolean).join(" ") || null;
        const city = a.city || a.town || a.village || null;
        const zip = a.postcode?.slice(0, 5) || null;
        const kind = hit.type === "playground" ? "playground" : hit.type === "library" ? "library" : "park";
        const display =
          [street, city, a.state, zip].filter(Boolean).join(", ") ||
          hit.display_name.split(",").slice(0, 3).join(",").trim();
        const links = nav({
          lat: plat,
          lon: plon,
          name,
          address: street,
          city,
          state: a.state || null,
          zip,
          displayAddress: display,
        });

        out.push({
          id,
          name,
          lat: plat,
          lon: plon,
          kind,
          address: street,
          city,
          zip,
          displayAddress: display,
          source: "nominatim",
          mapsUrl: links.mapsUrl,
          appleMapsUrl: links.appleMapsUrl,
          distanceMiles: Math.round(miles * 10) / 10,
          isPublicPark: true,
        });
      }
    } catch {
      /* next */
    }
  }
  return out;
}

function mergeKey(p: { name: string; lat: number; lon: number }) {
  // Coarser grid so OSM + official seed for the same park collapse together
  return `${p.name.toLowerCase().replace(/[^a-z0-9]+/g, "")}|${p.lat.toFixed(2)}|${p.lon.toFixed(2)}`;
}

function nameTokens(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/\b(park|parks|playground|playgrounds|the|at|near|in)\b/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function matchesNameQuery(placeName: string, q: string): boolean {
  const tokens = nameTokens(q);
  if (!tokens.length) return true;
  const hay = placeName.toLowerCase();
  // Prefer all tokens matching; require at least one distinctive token
  const hits = tokens.filter((t) => hay.includes(t));
  return hits.length >= Math.min(tokens.length, 2) || (tokens.length === 1 && hits.length === 1);
}

export async function GET(req: NextRequest) {
  const qRaw = (req.nextUrl.searchParams.get("q") || "park").trim() || "park";
  const near = (req.nextUrl.searchParams.get("near") || "").trim();
  const maxMiles = Math.min(25, Math.max(5, parseFloat(req.nextUrl.searchParams.get("miles") || "15") || 15));

  try {
    if (!near) {
      return NextResponse.json(
        { error: "Enter a zip or city (e.g. 30012 or Conyers, GA)." },
        { status: 400 },
      );
    }

    const g = await geocodeNear(near);
    if (!g) {
      return NextResponse.json(
        { error: "Couldn't find that US zip/city. Try 30012 or Conyers, GA." },
        { status: 404 },
      );
    }
    const { lat, lon, label, city, county, state, zip } = g;

    const qLower = qRaw.toLowerCase();
    const looksLikeName =
      qRaw.split(/\s+/).length >= 2 &&
      !/^(park|parks|playground|playgrounds|library|libraries|place|places)$/i.test(qRaw);

    const areaLabel = city || (county ? county.replace(/ County$/i, "") : null) || "Georgia";
    const areaFull = [areaLabel, state || "Georgia"].filter(Boolean).join(" ");
    const allowLibraries = /librar/.test(qLower);

    // Instant: curated public parks with playgrounds (fills OSM gaps like Wheeler / Milstead)
    const nameFilter = looksLikeName ? qRaw : undefined;
    const seeded = seedParksNear(lat, lon, maxMiles, nameFilter).map(seedToPlace);

    // Photon (parallel, fast)
    const photonQueries = looksLikeName
      ? [qRaw, `${qRaw} ${areaLabel}`, `${qRaw} Park ${areaLabel}`, `${qRaw} Georgia`]
      : [
          `park ${areaLabel}`,
          `playground ${areaLabel}`,
          `park ${areaFull}`,
          county ? `park ${county.replace(/ County$/i, "")}` : "",
          allowLibraries ? `library ${areaLabel}` : `recreation ${areaLabel}`,
        ].filter(Boolean);

    // Only hit Nominatim for specific names (slower, rate-limited)
    const nominatimQueries = looksLikeName
      ? [`${qRaw} ${areaFull}`, `${qRaw} Park ${areaFull}`]
      : [];

    const [photonPlaces, nomPlaces] = await Promise.all([
      photonSearch(photonQueries, lat, lon, maxMiles, allowLibraries),
      looksLikeName ? nominatimNameSearch(nominatimQueries, lat, lon, maxMiles) : Promise.resolve([] as PlaceResult[]),
    ]);

    // Prefer seed (real addresses) over OSM duplicates
    const byKey = new Map<string, PlaceResult>();
    for (const p of [...seeded, ...photonPlaces, ...nomPlaces]) {
      // For a typed park name, drop OSM noise that doesn't match
      if (looksLikeName && !matchesNameQuery(p.name, qRaw) && p.source !== "seed") continue;

      const key = mergeKey(p);
      const prev = byKey.get(key);
      if (!prev) {
        byKey.set(key, p);
        continue;
      }
      // Prefer seed (official addresses), then closer, then better address
      const rank = (x: PlaceResult) =>
        (x.source === "seed" ? 100 : 0) +
        (x.displayAddress ? 10 : 0) +
        (x.address ? 5 : 0) -
        x.distanceMiles;
      if (rank(p) > rank(prev)) byKey.set(key, p);
    }

    let places = [...byKey.values()];

    // Generic park search: keep parks/playgrounds only (drop libraries unless asked)
    if (!looksLikeName && !allowLibraries) {
      places = places.filter((p) => p.kind === "park" || p.kind === "playground" || p.isPublicPark);
    }

    // Name search: matching parks first, then by distance
    places.sort((a, b) => {
      if (looksLikeName) {
        const am = matchesNameQuery(a.name, qRaw) ? 0 : 1;
        const bm = matchesNameQuery(b.name, qRaw) ? 0 : 1;
        if (am !== bm) return am - bm;
      }
      return a.distanceMiles - b.distanceMiles;
    });

    return NextResponse.json({
      center: { lat, lon, label, city, county, state, zip },
      maxMiles,
      query: qRaw,
      places: places.slice(0, 50),
      counts: {
        seed: seeded.length,
        photon: photonPlaces.length,
        nominatim: nomPlaces.length,
        total: places.length,
      },
      note: "Public parks with playgrounds are ready to meet at — no venue partner signup. Tap a park for directions or Meet here.",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Search failed." },
      { status: 500 },
    );
  }
}
