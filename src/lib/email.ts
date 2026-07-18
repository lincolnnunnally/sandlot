// Server-only email sender via Resend. Sends FROM the verified subdomain
// (emails.unitedundergod.org) with Reply-To pointed at the real support inbox,
// so replies reach a human but sending never touches the root domain's mail.
// The API key never leaves the server.

type SendArgs = { to: string; subject: string; html: string; text: string };

export async function sendEmail({ to, subject, html, text }: SendArgs): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("email_not_configured");
  const from = process.env.RESEND_FROM || "Sandlot <no-reply@emails.unitedundergod.org>";
  const replyTo = process.env.RESEND_REPLY_TO;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
      text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`resend_failed_${res.status}: ${detail.slice(0, 300)}`);
  }
}

// Branded, plain, mobile-friendly reset email. No tracking, no images.
export function passwordResetEmail(link: string): { subject: string; html: string; text: string } {
  const subject = "Reset your Sandlot password";
  const text =
    `Reset your Sandlot password by opening this link:\n\n${link}\n\n` +
    `This link works once and expires in 30 minutes. ` +
    `If you didn't ask to reset your password, you can safely ignore this email — nothing will change.`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f7f4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c2b23">
  <div style="max-width:480px;margin:0 auto;padding:28px 20px">
    <div style="font-size:22px;font-weight:800">🛝 Sandlot</div>
    <div style="background:#fff;border:1px solid #e2ebe4;border-radius:14px;padding:22px;margin-top:16px">
      <h1 style="font-size:19px;margin:0 0 8px">Reset your password</h1>
      <p style="font-size:15px;line-height:1.5;margin:0 0 18px;color:#40514a">Tap the button to choose a new password. This link works once and expires in 30 minutes.</p>
      <a href="${link}" style="display:inline-block;background:#2e9e6b;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px;font-size:15px">Choose a new password</a>
      <p style="font-size:13px;line-height:1.5;margin:18px 0 0;color:#6b7a72">If the button doesn't work, copy this link into your browser:<br><span style="word-break:break-all;color:#2e9e6b">${link}</span></p>
    </div>
    <p style="font-size:12px;line-height:1.5;color:#8a978f;margin:16px 4px 0">If you didn't ask to reset your password, you can ignore this email — nothing will change. A United Under God app.</p>
  </div></body></html>`;
  return { subject, html, text };
}
