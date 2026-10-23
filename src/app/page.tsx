import type { Metadata } from "next";
import { HomeApp } from "@/components/HomeApp";
import { JsonLd } from "@/components/JsonLd";
import { SITE_URL, pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Sandlot — kids make real friends nearby",
  description:
    "Kids make real friends nearby. Either parent can host a playdate or help. Toy swaps and hangouts with families close to home.",
  path: "/",
});

export default function Home() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "Sandlot",
          url: `${SITE_URL}/`,
          applicationCategory: "LifestyleApplication",
          operatingSystem: "Web",
          description: "Playdates, toy swaps, and hangouts with families close to home. Parents only have accounts.",
          publisher: { "@id": `${SITE_URL}/#org` },
        }}
      />
      <HomeApp />
    </>
  );
}
