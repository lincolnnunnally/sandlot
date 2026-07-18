// Parent-account signup on the shared ecosystem GoTrue.
//
// Why a server route: LPL GoTrue requires email confirmation and has no mailer,
// so a public /signup would leave users unconfirmed and the password grant would
// fail "Email not confirmed". The proven ecosystem pattern is a server-side
// POST /auth/v1/admin/users with email_confirm:true using the service-role key.
// The key never leaves this route; everything else runs in the browser on the
// anon key under RLS.
//
// Shared-GoTrue rule: "email already registered" is NORMAL — a sibling app
// already has this person. We report { exists: true } and the client offers
// sign-in with the existing password (identity adoption — never reset it).

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return Response.json(
      { error: "Sign-up isn't connected right now. Please try again shortly." },
      { status: 503 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "That request didn't look right." }, { status: 400 });
  }

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const honeypot = String(body.hp || "");

  // Honeypot: bots that fill every field are turned away before any account exists.
  if (honeypot !== "") {
    return Response.json({ error: "That request didn't look right." }, { status: 400 });
  }
  if (!email.includes("@") || email.length < 5 || email.length > 320) {
    return Response.json({ error: "Please use a real email address." }, { status: 400 });
  }
  if (password.length < 8 || password.length > 200) {
    return Response.json({ error: "Please choose a password of at least 8 characters." }, { status: 400 });
  }

  const response = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });

  if (response.ok) {
    return Response.json({ created: true });
  }

  const detail = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const message = String(detail.msg || detail.error_description || detail.message || "");
  if (/already|exists|registered/i.test(message)) {
    return Response.json({ exists: true });
  }
  if (/invalid.*email|email.*invalid|is invalid/i.test(message)) {
    return Response.json({ error: "Please use a real email address." }, { status: 400 });
  }
  return Response.json(
    { error: "Something went wrong creating your account. Please try again." },
    { status: 400 }
  );
}
