// Lightweight liveness probe for uptime monitoring and deploy verification.
// Dependency-free and unauthenticated: returns 200 with a timestamp so external
// checkers can confirm the app is serving requests.

export const runtime = 'nodejs';

export async function GET() {
  return Response.json({ ok: true, ts: new Date().toISOString() }, { status: 200 });
}
