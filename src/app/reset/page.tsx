"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Landing page for the emailed reset link: /reset?token=… . Reads the token from
// the URL on the client (no useSearchParams, so no Suspense boundary needed),
// lets the parent choose a new password, and posts it to /api/reset/confirm.
export default function ResetPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token");
    setToken(t);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (password.length < 8) { setErr("Please choose a password of at least 8 characters."); return; }
    if (password !== confirm) { setErr("Those two passwords don't match."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (data.error) { setErr(data.error); return; }
      setDone(true);
      setTimeout(() => router.push("/"), 1800);
    } catch {
      setErr("We couldn't reach the server — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell">
      <div className="bar"><div className="brand"><div className="mark">🛝</div><b>Sandlot</b></div></div>
      <div className="pad">
        <div className="eyebrow first">Choose a new password</div>
        <div className="card">
          {done ? (
            <p className="note note-clover small" style={{ margin: 0 }}>Your password is updated. 🎉 Taking you to sign in…</p>
          ) : token === null ? (
            <p className="muted small" style={{ margin: 0 }}>Loading…</p>
          ) : token === "" || !token ? (
            <>
              <p className="note note-sun small" style={{ marginTop: 0 }}>This reset link is missing its code. Please open the link from your email again, or request a new one.</p>
              <button className="btn btn-ghost btn-block" onClick={() => router.push("/")}>Back to sign in</button>
            </>
          ) : (
            <form onSubmit={submit}>
              <p className="small muted" style={{ margin: "0 0 14px" }}>Pick a new password for your Sandlot account. This link works once.</p>
              <div className="field"><label htmlFor="pw">New password</label>
                <input id="pw" type={show ? "text" : "password"} autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" /></div>
              <div className="field"><label htmlFor="pw2">Confirm new password</label>
                <input id="pw2" type={show ? "text" : "password"} autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Type it again" /></div>
              <label className="tiny muted" style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, cursor: "pointer" }}>
                <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} style={{ width: 16, height: 16 }} /> Show password
              </label>
              {err && <p className="note note-sun" style={{ marginBottom: 12 }}>{err}</p>}
              <button className="btn btn-primary btn-block" disabled={busy || !password || !confirm}>{busy ? "Saving…" : "Update password"}</button>
            </form>
          )}
        </div>
      </div>
      <footer className="foot">
        <a href="/terms">Terms</a><span>·</span><a href="/privacy">Privacy</a><span>·</span><span>A United Under God app</span>
      </footer>
    </div>
  );
}
