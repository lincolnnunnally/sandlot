"use client";

import dynamic from "next/dynamic";

const PlaceFinderMap = dynamic(
  () => import("@/components/PlaceFinderMap").then((m) => m.PlaceFinderMap),
  { ssr: false, loading: () => <p className="muted small">Loading map…</p> },
);

/** Existing park-details door (seed + OSM) — no account required for directions. */
export function PublicParkFinder({ onFlash }: { onFlash?: (m: string) => void }) {
  return (
    <PlaceFinderMap
      uid=""
      defaultZip="30012"
      defaultArea="Conyers, GA"
      onFlash={onFlash ?? (() => {})}
    />
  );
}
