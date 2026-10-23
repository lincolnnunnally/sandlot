import type { Metadata } from "next";
import { NOINDEX } from "@/lib/seo";

// Private, invite-only, or per-user screen: keep it out of search.
export const metadata: Metadata = NOINDEX;

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
