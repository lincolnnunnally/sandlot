import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";

function venueInviteEmail(orgName: string, link: string, message?: string | null) {
  const subject = `You're invited to host Sandlot at ${orgName}`;
  const text =
    `Hi,\n\nSandlot would love ${orgName} to be a family meetup location — free fidget/toy trading and supervised playdates.\n\n` +
    `Claim your venue profile (set promos + discounts on your other services):\n${link}\n\n` +
    (message ? `Note from Sandlot: ${message}\n\n` : "") +
    `This link expires in 30 days.\n\n— Sandlot (a United Under God app)`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f7f4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c2b23">
  <div style="max-width:480px;margin:0 auto;padding:28px 20px">
    <div style="font-size:22px;font-weight:800">🛝 Sandlot</div>
    <div style="background:#fff;border:1px solid #e2ebe4;border-radius:14px;padding:22px;margin-top:16px">
      <h1 style="font-size:19px;margin:0 0 8px">Host family playdates at ${escapeHtml(orgName)}</h1>
      <p style="font-size:15px;line-height:1.5;margin:0 0 12px;color:#40514a">Free fidget &amp; toy trading meetups for families. You control meetup promos and discounts on your other services.</p>
      ${message ? `<p style="font-size:14px;line-height:1.5;margin:0 0 14px;padding:10px 12px;background:#e1f4ec;border-radius:10px;color:#0b7c52">${escapeHtml(message)}</p>` : ""}
      <a href="${link}" style="display:inline-block;background:#0fa06b;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px;font-size:15px">Claim your venue</a>
      <p style="font-size:13px;line-height:1.5;margin:18px 0 0;color:#6b7a72">Link expires in 30 days.<br><span style="word-break:break-all;color:#0b7c52">${link}</span></p>
    </div>
  </div></body></html>`;
  return { subject, html, text };
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization") || "";
    const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!jwt) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    if (!url || !anon) return NextResponse.json({ error: "Server misconfigured." }, { status: 500 });

    const supa = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json().catch(() => ({}));
    const orgName = String(body.orgName || "").trim();
    const contactEmail = String(body.contactEmail || "").trim();
    const contactName = String(body.contactName || "").trim();
    const venueType = String(body.venueType || "other");
    const neighborhood = String(body.neighborhood || "").trim();
    const message = String(body.message || "").trim();
    const origin = String(body.origin || "").replace(/\/$/, "");

    if (orgName.length < 2) return NextResponse.json({ error: "Organization name required." }, { status: 400 });
    if (!contactEmail.includes("@")) return NextResponse.json({ error: "Valid contact email required to send invite." }, { status: 400 });

    const { data, error } = await supa.rpc("swaparound_admin_create_venue_invite", {
      p_org_name: orgName,
      p_contact_email: contactEmail,
      p_contact_name: contactName || null,
      p_venue_type: venueType,
      p_neighborhood: neighborhood || null,
      p_message: message || null,
    });
    if (error) {
      if (/not_admin/.test(error.message || "")) return NextResponse.json({ error: "Admin only." }, { status: 403 });
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const code = (data as { code: string }).code;
    const link = `${origin || "https://sandlot.unitedundergod.org"}/venue/claim/${code}`;
    const mail = venueInviteEmail(orgName, link, message || null);

    try {
      await sendEmail({ to: contactEmail, ...mail });
    } catch (e) {
      // Invite still created — return link if email not configured
      const msg = e instanceof Error ? e.message : "email_failed";
      return NextResponse.json({
        ok: true,
        code,
        link,
        emailed: false,
        warning: msg.includes("email_not_configured")
          ? "Invite created but email is not configured on the server (RESEND_API_KEY)."
          : `Invite created; email failed: ${msg}`,
      });
    }

    return NextResponse.json({ ok: true, code, link, emailed: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
