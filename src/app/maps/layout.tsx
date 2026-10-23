import type { Metadata } from "next";
import { JsonLd } from "@/components/JsonLd";
import { pageMetadata, serviceLd } from "@/lib/seo";

const DESCRIPTION =
  "Find a public park or playground for a playdate. Search by ZIP code or town and tap a result for Google Maps or Apple Maps directions. No account needed.";

export const metadata: Metadata = pageMetadata({
  title: "Find a park or playground for a playdate | Sandlot",
  description: DESCRIPTION,
  path: "/maps",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={serviceLd({ name: "Find a park", description: DESCRIPTION, path: "/maps", serviceType: "Public park and playground finder" })} />
      {children}
    </>
  );
}
