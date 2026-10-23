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
          <h1 style={{ fontSize: "1.4rem", margin: 0 }}>Find a park</h1>
          <p>Public parks — tap a result for Google Maps or Apple Maps. No venue signup.</p>
        </div>
        <div className="card">
          <PublicParkFinder />
        </div>
      </div>
    </div>
  );
}
