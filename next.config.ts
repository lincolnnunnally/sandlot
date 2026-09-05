import type { NextConfig } from "next";

// Guessed /signup /login URLs 404'd as a Next 404 page (GATCA T). Auth lives on /.
const AUTH_ALIASES = ["/signup", "/sign-up", "/login", "/signin", "/sign-in", "/auth"];

// leftover-preview (Kindred pattern): Preview env often lacks Production
// NEXT_PUBLIC_* so the host says "isn't connected to its database." The LPL
// anon key is public by design — already in the live sandlot.unitedundergod.org
// JS bundle — so Preview can read the same production Sandlot/swaparound DB
// without asking the owner to paste secrets.
const LPL_SUPABASE_URL = "https://uqhqulrqcygsmmzdzemx.supabase.co";
const LPL_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxaHF1bHJxY3lnc21temR6ZW14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExOTY1MjQsImV4cCI6MjA5Njc3MjUyNH0.vnDAP0xCLOe1oMHE6fl44M3pEhOSEM8Ri7pmNrUUAWY";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || LPL_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || LPL_SUPABASE_ANON_KEY,
  },
  async redirects() {
    return AUTH_ALIASES.map((source) => ({
      source,
      destination: "/",
      permanent: false,
    }));
  },
};

export default nextConfig;
