"use client";

import { PublicParkFinder } from "@/components/PublicParkFinder";

export default function ParksMapPage() {
  return (
    <div className="shell">
      <div className="bar">
        <div className="brand"><div className="mark">🛝</div><b>Sandlot</b></div>
        <a className="btn btn-ghost" style={{ padding: "8px 12px", fontSize: ".82rem" }} href="/">Back to app</a>
      </div>
      <div className="pad">
        <div className="section-head">
          <h2>Find a park</h2>
          <p>Public parks — tap a result for Google Maps or Apple Maps. No venue signup.</p>
        </div>
        <div className="card">
          <PublicParkFinder />
        </div>
      </div>
    </div>
  );
}
