/**
 * Curated public parks with playgrounds — places families meet without venue signup.
 * OpenStreetMap often misses local parks (e.g. Wheeler, Milstead in Conyers).
 *
 * Coordinates prefer: OSM park centroid > geocoded street address > county GPS.
 * Navigation uses full street addresses (see mapNav.ts) so Maps apps don't
 * send people to the wrong "Wheeler Park" in another state.
 */

export type SeedPark = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  address: string;
  city: string;
  zip: string;
  state: string;
  kind: "park" | "playground";
  note?: string;
};

/** Convert N DD°MM.mm W DDD°MM.mm to decimal degrees */
export function dmsMin(nDeg: number, nMin: number, wDeg: number, wMin: number) {
  return {
    lat: nDeg + nMin / 60,
    lon: -(wDeg + wMin / 60),
  };
}

/**
 * Rockdale County + City of Conyers parks designed for kids (playgrounds).
 * lat/lon validated against OSM centroids or house-number geocodes where possible.
 */
export const SEEDED_PUBLIC_PARKS: SeedPark[] = [
  // —— City of Conyers (OSM centroids) ——
  {
    id: "seed-bonner",
    name: "Bonner Park",
    lat: 33.67004,
    lon: -84.00734,
    address: "950 Rowland Road NE",
    city: "Conyers",
    zip: "30012",
    state: "GA",
    kind: "park",
    note: "Playgrounds, pavilion, tennis, basketball",
  },
  {
    id: "seed-eastview",
    name: "Eastview Park",
    lat: 33.67254,
    lon: -84.00898,
    address: "1171 East View Road",
    city: "Conyers",
    zip: "30012",
    state: "GA",
    kind: "park",
    note: "Shaded play structure, swings, fitness",
  },
  {
    id: "seed-pleasant",
    name: "Pleasant Circle Park",
    lat: 33.67594,
    lon: -84.02852,
    address: "1200 Pleasant Circle NW",
    city: "Conyers",
    zip: "30012",
    state: "GA",
    kind: "park",
    note: "Play structure, swings, basketball",
  },
  {
    id: "seed-veal",
    name: "Veal Street Park",
    lat: 33.66271,
    lon: -84.02373,
    address: "1160 Veal Street",
    city: "Conyers",
    zip: "30012",
    state: "GA",
    kind: "park",
    note: "Play structure, swings, basketball",
  },
  {
    id: "seed-center-point",
    name: "Center Point Park",
    lat: 33.66674,
    lon: -84.01895,
    address: "941 Green Street SW",
    city: "Conyers",
    zip: "30012",
    state: "GA",
    kind: "park",
  },
  {
    id: "seed-unity",
    name: "Unity Park",
    lat: 33.66608,
    lon: -84.0185,
    address: "900 Green Street SW",
    city: "Conyers",
    zip: "30012",
    state: "GA",
    kind: "park",
  },
  {
    id: "seed-city-center",
    name: "Randal S. Mills City Center Park",
    lat: 33.66651,
    lon: -84.01691,
    address: "949 Main Street NE",
    city: "Conyers",
    zip: "30012",
    state: "GA",
    kind: "park",
    note: "City center park & Lewis-Vaughn Botanical Garden",
  },
  {
    id: "seed-hicks",
    name: "South Hicks Circle Park",
    lat: 33.6815,
    lon: -84.0188,
    address: "South Hicks Circle",
    city: "Conyers",
    zip: "30012",
    state: "GA",
    kind: "park",
  },

  // —— Rockdale County ——
  {
    id: "seed-pine-log",
    name: "Pine Log Park",
    // OSM park polygon center (matches playgrounds on site)
    lat: 33.66278,
    lon: -83.99825,
    address: "1451 Pine Log Road NE",
    city: "Conyers",
    zip: "30012",
    state: "GA",
    kind: "park",
    note: "Two playgrounds, pavilion, tennis, basketball, trail",
  },
  {
    id: "seed-milstead",
    name: "Milstead Park",
    // County GPS (N 33°40.59 W 84°02.23) — house # not in OSM
    ...dmsMin(33, 40.59, 84, 2.23),
    address: "1665 Main Street NE",
    city: "Conyers",
    zip: "30012",
    state: "GA",
    kind: "park",
    note: "Playground, splash pad, pavilion, fitness trail",
  },
  {
    id: "seed-wheeler",
    name: "Wheeler Park",
    // Align with 1400 Parker Rd SE entrance (house geocode + county field GPS)
    lat: 33.6536,
    lon: -84.0197,
    address: "1400 Parker Road SE",
    city: "Conyers",
    zip: "30094",
    state: "GA",
    kind: "park",
    note: "Fields, playground area, pavilion (The Lawn @ Wheeler)",
  },
  {
    id: "seed-grimes",
    name: "Grimes Street Park",
    lat: 33.68992,
    lon: -83.99799,
    address: "1792 Grimes Street NW",
    city: "Conyers",
    zip: "30012",
    state: "GA",
    kind: "park",
    note: "Playground, picnic tables",
  },
  {
    id: "seed-lakeview1",
    name: "Lakeview Estates Park #1",
    ...dmsMin(33, 42.48, 84, 2.45),
    address: "2500 Lake Rockaway Road",
    city: "Conyers",
    zip: "30012",
    state: "GA",
    kind: "park",
    note: "Playground, basketball, picnic",
  },
  {
    id: "seed-legion",
    name: "Legion Fields",
    ...dmsMin(33, 39.53, 84, 0.01),
    address: "1260 South Main Street",
    city: "Conyers",
    zip: "30012",
    state: "GA",
    kind: "park",
    note: "Playground, baseball, pavilion",
  },
  {
    id: "seed-black-shoals",
    name: "Black Shoals Park",
    ...dmsMin(33, 45.11, 83, 56.88),
    address: "3001 Black Shoals Road NE",
    city: "Conyers",
    zip: "30012",
    state: "GA",
    kind: "park",
    note: "Playground, lake, trails (closed Wednesdays)",
  },
  {
    id: "seed-johnson",
    name: "Johnson Park",
    lat: 33.64141,
    lon: -84.04436,
    address: "1781 Ebenezer Road SW",
    city: "Conyers",
    zip: "30094",
    state: "GA",
    kind: "park",
    note: "Playground, rec center, pool, fields",
  },
  {
    id: "seed-shady-grove",
    name: "Shady Grove Park",
    ...dmsMin(33, 38.67, 83, 58.66),
    address: "2100 Old Covington Road",
    city: "Conyers",
    zip: "30013",
    state: "GA",
    kind: "park",
    note: "Playground, basketball, picnic",
  },
  {
    id: "seed-south-rockdale",
    name: "South Rockdale Park",
    ...dmsMin(33, 36.35, 84, 6.94),
    address: "3909 East Fairview Road",
    city: "Stockbridge",
    zip: "30281",
    state: "GA",
    kind: "park",
    note: "Playground, pavilion, trails",
  },
  {
    id: "seed-richardson",
    name: "Richardson Park",
    ...dmsMin(33, 35.36, 84, 8.26),
    address: "3779 Union Church Road",
    city: "Stockbridge",
    zip: "30281",
    state: "GA",
    kind: "park",
    note: "Playground, pavilion, tennis",
  },
  {
    id: "seed-costley",
    name: "Costley Mill Park",
    lat: 33.70857,
    lon: -83.92749,
    address: "Costley Mill Road NE",
    city: "Conyers",
    zip: "30013",
    state: "GA",
    kind: "park",
    note: "Park & beach area",
  },
];

/** US zip → principal city for map queries (when geocoder only returns county). */
export const ZIP_TO_CITY: Record<string, { city: string; state: string }> = {
  "30012": { city: "Conyers", state: "Georgia" },
  "30013": { city: "Conyers", state: "Georgia" },
  "30094": { city: "Conyers", state: "Georgia" },
  "30014": { city: "Covington", state: "Georgia" },
  "30016": { city: "Covington", state: "Georgia" },
  "30030": { city: "Decatur", state: "Georgia" },
  "30032": { city: "Decatur", state: "Georgia" },
  "30033": { city: "Decatur", state: "Georgia" },
  "30307": { city: "Atlanta", state: "Georgia" },
  "30308": { city: "Atlanta", state: "Georgia" },
  "30309": { city: "Atlanta", state: "Georgia" },
  "30316": { city: "Atlanta", state: "Georgia" },
  "30317": { city: "Atlanta", state: "Georgia" },
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

export function seedParksNear(
  lat: number,
  lon: number,
  maxMiles: number,
  nameFilter?: string,
): Array<SeedPark & { distanceMiles: number }> {
  const q = (nameFilter || "").trim().toLowerCase();
  const tokens = q
    .replace(/\b(park|parks|playground|playgrounds|the|at|near|in)\b/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);

  return SEEDED_PUBLIC_PARKS.map((p) => ({
    ...p,
    distanceMiles: Math.round(haversineMiles(lat, lon, p.lat, p.lon) * 10) / 10,
  }))
    .filter((p) => p.distanceMiles <= maxMiles)
    .filter((p) => {
      if (!tokens.length) return true;
      const hay = `${p.name} ${p.city} ${p.address}`.toLowerCase();
      if (tokens.length === 1) return hay.includes(tokens[0]);
      return tokens.every((t) => hay.includes(t)) || tokens.some((t) => hay.includes(t) && t.length >= 5);
    })
    .sort((a, b) => a.distanceMiles - b.distanceMiles);
}
