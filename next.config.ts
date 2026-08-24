import type { NextConfig } from "next";

// Guessed /signup /login URLs 404'd as a Next 404 page (GATCA T). Auth lives on /.
const AUTH_ALIASES = ["/signup", "/sign-up", "/login", "/signin", "/sign-in", "/auth"];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return AUTH_ALIASES.map((source) => ({
      source,
      destination: "/",
      permanent: false,
    }));
  },
};

export default nextConfig;
