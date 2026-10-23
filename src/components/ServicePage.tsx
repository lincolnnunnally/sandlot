import type { ReactNode } from "react";
import { SERVICE_PAGES } from "@/lib/seo";

/** Plain-language page for one thing Sandlot does, in the same layout as Terms and Privacy. */
export function ServicePage({
  path, kicker, title, intro, whoFor, youGet, steps, safety, cta,
}: {
  path: string;
  kicker: string;
  title: string;
  intro: string;
  whoFor: string[];
  youGet: string[];
  steps: string[];
  safety: ReactNode;
  cta: { href: string; label: string };
}) {
  return (
    <div className="shell">
      <div className="bar">
        <a href="/" className="brand" style={{ textDecoration: "none", color: "inherit" }}><div className="mark">🛝</div><b>Sandlot</b></a>
        <a className="btn btn-ghost" style={{ padding: "8px 12px", fontSize: ".82rem" }} href="/">Open Sandlot</a>
      </div>
      <div className="legal">
        <p className="kicker">{kicker}</p>
        <h1>{title}</h1>
        <p>{intro}</p>
        <p><a className="btn btn-primary" style={{ textDecoration: "none" }} href={cta.href}>{cta.label}</a></p>
        <h2>Who it is for</h2>
        <ul>{whoFor.map((t) => <li key={t}>{t}</li>)}</ul>
        <h2>What you get</h2>
        <ul>{youGet.map((t) => <li key={t}>{t}</li>)}</ul>
        <h2>How it works</h2>
        <ol>{steps.map((t) => <li key={t}>{t}</li>)}</ol>
        <h2>Safety</h2>
        {safety}
        <h2>More on Sandlot</h2>
        <ul>
          {SERVICE_PAGES.filter((p) => p.path !== path).map((p) => <li key={p.path}><a href={p.path}>{p.label}</a></li>)}
        </ul>
      </div>
      <footer className="foot">
        <a href="/terms">Terms</a><span>·</span>
        <a href="/privacy">Privacy</a><span>·</span>
        <span>A United Under God app</span>
      </footer>
    </div>
  );
}
