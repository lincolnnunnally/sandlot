// Step 2 of self-serve password reset: the user submits a new password with the
// token from their emailed link.
//
// The token is consumed atomically (single-use, replay-safe, expiry-checked) by
// a service-role DB function that returns the user id; the password is then set
// via the GoTrue admin API. Service key stays on the server.

import crypto from "crypto";

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return Response.json({ error: "Password reset isn't available right now. Please try again shortly." }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "That request didn't look right." }, { status: 400 });
  }

  const token = String(body.token || "");
  const password = String(body.password || "");
  const invalidLink = { error: "This reset link is invalid or has expired. Please request a new one." };
  if (token.length < 20 || token.length > 200) return Response.json(invalidLink, { status: 400 });
  // Min 8; max 72 = bcrypt's byte limit (a longer value would be rejected by the
  // auth server AFTER the token is spent, so we stop it here before consuming).
  if (password.length < 8) {
    return Response.json({ error: "Please choose a password of at least 8 characters." }, { status: 400 });
  }
  if (Buffer.byteLength(password, "utf8") > 72) {
    return Response.json({ error: "Please choose a password of 72 characters or fewer." }, { status: 400 });
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  // Consume the token -> user id (null if unknown/used/expired).
  let userId: string | null = null;
  try {
    const res = await fetch(`${url}/rest/v1/rpc/swaparound_consume_reset`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_token_hash: tokenHash }),
    });
    if (res.ok) {
      const value = (await res.json().catch(() => null)) as string | null;
      userId = value && typeof value === "string" ? value : null;
    }
  } catch {
    return Response.json({ error: "Something went wrong. Please request a new link." }, { status: 400 });
  }

  if (!userId) return Response.json(invalidLink, { status: 400 });

  const update = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
    method: "PUT",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password }),
  });

  if (!update.ok) {
    // The token was already consumed above; re-open it so the SAME link can be
    // retried (the user isn't sent back to square one for a fixable problem).
    try {
      await fetch(`${url}/rest/v1/rpc/swaparound_reopen_reset`, {
        method: "POST",
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ p_token_hash: tokenHash }),
      });
    } catch {
      /* best effort */
    }
    // Surface the real reason when it's about the password itself.
    const detail = (await update.json().catch(() => ({}))) as Record<string, unknown>;
    const message = String(detail.msg || detail.error_description || detail.message || "");
    if (update.status === 422 || /password|weak|pwned|leaked/i.test(message)) {
      return Response.json({ error: "That password can't be used — please choose a different one, then try your link again." }, { status: 400 });
    }
    return Response.json({ error: "Couldn't update your password just now. Please try your link again in a moment." }, { status: 400 });
  }

  return Response.json({ ok: true });
}
