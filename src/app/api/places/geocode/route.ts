import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const UA = "SandlotMeetupFinder/1.0 (unitedundergod.org; family meetup app)";

/** Geocode zip or city in the US (avoids matching foreign postcodes). */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < 2) {
    return NextResponse.json({ error: "Enter a zip or city." }, { status: 400 });
  }

  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    // Pure 5-digit zip → postalcode search (30030 alone wrongly hits Italy without country)
    if (/^\d{5}(-\d{4})?$/.test(q)) {
      url.searchParams.set("postalcode", q.slice(0, 5));
      url.searchParams.set("country", "USA");
    } else {
      url.searchParams.set("q", q.includes("USA") || q.includes("United States") ? q : `${q}, USA`);
      url.searchParams.set("countrycodes", "us");
    }
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");
    url.searchParams.set("addressdetails", "1");

    const res = await fetch(url.toString(), {
      headers: { "User-Agent": UA, Accept: "application/json" },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return NextResponse.json({ error: "Geocoder unavailable." }, { status: 502 });

    const data = (await res.json()) as Array<{
      lat: string;
      lon: string;
      display_name: string;
      address?: Record<string, string>;
    }>;
    if (!data?.length) {
      return NextResponse.json({ error: "Couldn't find that zip or city in the US." }, { status: 404 });
    }
    const hit = data[0];
    const addr = hit.address || {};
    return NextResponse.json({
      lat: parseFloat(hit.lat),
      lon: parseFloat(hit.lon),
      label: hit.display_name,
      zip: addr.postcode || (/^\d{5}/.test(q) ? q.slice(0, 5) : null),
      city: addr.city || addr.town || addr.village || addr.county || null,
      state: addr.state || null,
    });
  } catch {
    return NextResponse.json({ error: "Geocode failed." }, { status: 500 });
  }
}
