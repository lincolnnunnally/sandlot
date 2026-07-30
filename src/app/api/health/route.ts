// Liveness + honest ops readiness for Sandlot (password-reset mailer, DB).
// Never leaks secrets — only booleans for whether required keys are present.

export const runtime = "nodejs";

export async function GET() {
  const emailConfigured = Boolean(process.env.RESEND_API_KEY?.trim());
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
  const ok = emailConfigured && supabaseConfigured;
  return Response.json(
    {
      ok,
      app: "Sandlot",
      ts: new Date().toISOString(),
      emailConfigured,
      supabaseConfigured,
      resetPath: "/api/reset/request",
    },
    { status: ok ? 200 : 503 },
  );
}
