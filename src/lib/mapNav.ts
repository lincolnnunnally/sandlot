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
}): { mapsUrl: string; appleMapsUrl: string; queryLabel: string } {
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
  // Apple: daddr as full address (never bare name alone). ll helps center the map.
  const appleMapsUrl = `https://maps.apple.com/?daddr=${dest}&ll=${lat},${lon}&dirflg=d`;

  return { mapsUrl, appleMapsUrl, queryLabel };
}
