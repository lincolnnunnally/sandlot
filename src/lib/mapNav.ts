/** Free navigation links (no Google Places API key). Prefer full street address. */

export function buildMapNavLinks(opts: {
  lat: number;
  lon: number;
  name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  displayAddress?: string | null;
}): { mapsUrl: string; appleMapsUrl: string; appleMapsDoorUrl: string; queryLabel: string } {
  const { lat, lon, name } = opts;
  const streetLine =
    opts.displayAddress?.trim() ||
    [opts.address, opts.city, opts.state || "GA", opts.zip].filter(Boolean).join(", ").trim() ||
    "";

  // Full address routes correctly in Google/Apple. Bare park names (e.g. "Wheeler Park")
  // often resolve to the wrong city. Lat/lon alone can pin a field off the entrance.
  // Best: "Name, 123 Street, City, ST ZIP" so Maps can snap to the place + street.
  let queryLabel = "";
  if (streetLine && name && !streetLine.toLowerCase().includes(name.toLowerCase().slice(0, 8))) {
    queryLabel = `${name}, ${streetLine}`;
  } else if (streetLine) {
    queryLabel = streetLine;
  } else if (name) {
    queryLabel = `${name}, Conyers, GA`;
  } else {
    queryLabel = `${lat},${lon}`;
  }

  const dest = encodeURIComponent(queryLabel);
  // Google: address query (reliable). Append coords as fallback for precision.
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
  // Apple web search (?q=). daddr+dirflg is a native-app deep-link; with target=_blank
  // it Opens about:blank on non-Apple / CoS walkers (same class as FurFriend Terms).
  const hasPin = Number.isFinite(lat) && Number.isFinite(lon);
  const appleMapsUrl = hasPin
    ? `https://maps.apple.com/?q=${dest}&ll=${lat},${lon}`
    : `https://maps.apple.com/?q=${dest}`;
  // Same-origin door so the park-details button never Opens an empty new tab.
  const appleMapsDoorUrl = hasPin
    ? `/maps/apple?q=${dest}&ll=${lat},${lon}`
    : `/maps/apple?q=${dest}`;

  return { mapsUrl, appleMapsUrl, appleMapsDoorUrl, queryLabel };
}
