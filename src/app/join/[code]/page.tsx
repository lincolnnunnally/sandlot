"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { redeemCode } from "@/lib/db";

// Warm landing for a personal invite link: /join/<family-code>.
// - New here: we stash the code and send you to sign up; onboarding connects
//   you to the family who invited you automatically.
// - Already a member: connect with that family in one tap.
export default function JoinPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = decodeURIComponent((params?.code ?? "").toString()).trim();
  const supa = getSupabase();

  const [state, setState] = useState<"loading" | "guest" | "member" | "connecting" | "done" | "error">("loading");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (code) {
      try {
        // Prefer Sandlot key; keep SwapAround key during rename so in-flight invites still redeem.
        window.localStorage.setItem("sandlot_pending_code", code);
        window.localStorage.setItem("swaparound_pending_code", code);
      } catch {}
    }
    if (!supa) { setState("guest"); return; }
    supa.auth.getSession().then(({ data }) => setState(data.session ? "member" : "guest"));
  }, [code, supa]);

  const connectNow = useCallback(async () => {
    setState("connecting");
    try {
      await redeemCode(code);
      try {
        window.localStorage.removeItem("sandlot_pending_code");
        window.localStorage.removeItem("swaparound_pending_code");
      } catch {}
      setMsg("You're connected! 🤝");
      setState("done");
      setTimeout(() => router.push("/"), 1300);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't use that code.");
      setState("error");
    }
  }, [code, router]);

  return (
    <div className="shell">
      <div className="bar">
        <div className="brand"><div className="mark">🛝</div><b>Sandlot</b></div>
      </div>
      <div className="pad">
        <div className="hero-card" style={{ marginTop: 8 }}>
          <div style={{ fontFamily: "var(--fd)", fontWeight: 800, fontSize: "1.5rem" }}>A friend invited you 🤝</div>
          <p className="small" style={{ opacity: .95, margin: "8px 0 0" }}>
            Sandlot is for fidget trading, other toy swaps, and supervised playdates with nearby families. Your friend wants to connect their family with yours.
          </p>
        </div>

        <div className="card">
          {state === "loading" && <p className="muted small" style={{ margin: 0 }}>One moment…</p>}

          {state === "guest" && (
            <>
              <h2 style={{ fontSize: "1.15rem", margin: "0 0 6px" }}>Come join us</h2>
              <p className="small muted" style={{ margin: "0 0 14px" }}>Create your free parent account. You&apos;ll start out connected to the family who invited you.</p>
              <button className="btn btn-primary btn-block" onClick={() => router.push("/")}>Get started</button>
              <p className="tiny muted" style={{ margin: "12px 0 0", textAlign: "center" }}>Parents only — kids never get logins. We never ask for a child&apos;s last name, birthday, photo, or address.</p>
            </>
          )}

          {state === "member" && (
            <>
              <h2 style={{ fontSize: "1.15rem", margin: "0 0 6px" }}>Connect this family</h2>
              <p className="small muted" style={{ margin: "0 0 14px" }}>You&apos;re signed in. Tap below to connect with the family who shared this link — you&apos;ll see each other at meetups.</p>
              <button className="btn btn-primary btn-block" onClick={connectNow}>🤝 Connect now</button>
              <button className="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={() => router.push("/")}>Not now</button>
            </>
          )}

          {state === "connecting" && <p className="muted small" style={{ margin: 0 }}>Connecting…</p>}

          {state === "done" && <p className="note note-clover small" style={{ margin: 0 }}>{msg} Taking you to Sandlot…</p>}

          {state === "error" && (
            <>
              <p className="note note-sun small" style={{ marginTop: 0 }}>{msg}</p>
              <button className="btn btn-ghost btn-block" onClick={() => router.push("/")}>Go to Sandlot</button>
            </>
          )}
        </div>
      </div>
      <footer className="foot">
        <a href="/terms">Terms</a><span>·</span>
        <a href="/privacy">Privacy</a><span>·</span>
        <span>A United Under God app</span>
      </footer>
    </div>
  );
}
