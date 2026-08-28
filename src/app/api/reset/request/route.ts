// Step 1 of self-serve password reset: the user asks for a link.
// Unknown emails still get { ok: true } so this cannot be used to discover
// who's registered. Mailer failure is different: that is 503, not a fake send.

import crypto from "crypto";
import { sendEmail, passwordResetEmail } from "@/lib/email";

const UNAVAILABLE = {
  error: "reset_unavailable",
  message:
    "We couldn't send a reset email right now. Please try again in a few minutes, or ask for help from the address on your account.",
};

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ok = () => Response.json({ ok: true });
  if (!url || !serviceKey || !process.env.RESEND_API_KEY?.trim()) {
    return Response.json(UNAVAILABLE, { status: 503 });
  }

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
    return Response.json(UNAVAILABLE, { status: 503 });
  }

  if (issued && issued.user_id) {
    const base = (process.env.APP_BASE_URL || new URL(request.url).origin).replace(/\/+$/, "");
    const link = `${base}/reset?token=${rawToken}`;
    const mail = passwordResetEmail(link);
    try {
      await sendEmail({ to: email, subject: mail.subject, html: mail.html, text: mail.text });
    } catch (e) {
      console.error("[reset] email send failed:", e instanceof Error ? e.message : e);
      return Response.json(UNAVAILABLE, { status: 503 });
    }
  }

  return ok();
}
