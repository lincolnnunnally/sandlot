// Step 1 of self-serve password reset: the user asks for a link.
//
// Privacy: this ALWAYS responds { ok: true } — whether or not the email has an
// account — so it can't be used to discover who's registered. The DB function
// silently no-ops for unknown emails and throttles to one token per 60s.
//
// The raw token is generated here, emailed as the only copy, and stored only as
// a sha256 hash. Service key stays on the server.

import crypto from "crypto";
import { after } from "next/server";
import { sendEmail, passwordResetEmail } from "@/lib/email";

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ok = () => Response.json({ ok: true });
  if (!url || !serviceKey) return ok();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return ok();
  }
  const email = String(body.email || "").trim().toLowerCase();
  if (!email.includes("@") || email.length < 5 || email.length > 320) return ok();

  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";

  type Issued = { user_id?: string; email?: string; throttled?: boolean };
  let issued: Issued | null = null;
  try {
    const res = await fetch(`${url}/rest/v1/rpc/swaparound_issue_reset`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_email: email, p_token_hash: tokenHash, p_ip: ip }),
    });
    if (res.ok) issued = (await res.json().catch(() => null)) as Issued | null;
  } catch {
    /* swallow — never reveal anything to the caller */
  }

  if (issued && issued.user_id) {
    const base = (process.env.APP_BASE_URL || new URL(request.url).origin).replace(/\/+$/, "");
    const link = `${base}/reset?token=${rawToken}`;
    const mail = passwordResetEmail(link);
    // Send AFTER the response is flushed. This keeps response time identical for
    // registered vs unregistered emails (no timing side-channel / enumeration),
    // and lets us log delivery failures instead of silently swallowing them.
    after(async () => {
      try {
        await sendEmail({ to: email, subject: mail.subject, html: mail.html, text: mail.text });
      } catch (e) {
        console.error("[reset] email send failed:", e instanceof Error ? e.message : e);
      }
    });
  }

  return ok();
}
