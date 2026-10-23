import type { Metadata } from "next";

/** Production host. Canonicals and the sitemap always use it, never a preview or alias. */
export const SITE_URL = "https://sandlot.unitedundergod.org";
export const SITE_NAME = "Sandlot";

/** Site-wide publisher. Terms: "Sandlot is a service of United Under God, Inc." */
export const ORGANIZATION_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": `${SITE_URL}/#org`,
  name: SITE_NAME,
  url: `${SITE_URL}/`,
  description: "Kids make real friends nearby. Playdates, toy swaps, and hangouts with families close to home.",
  parentOrganization: { "@type": "Organization", name: "United Under God, Inc." },
};

/** Title, description, canonical, Open Graph and Twitter for one public page. */
export function pageMetadata({ title, description, path }: { title: string; description: string; path: string }): Metadata {
  const url = `${SITE_URL}${path === "/" ? "/" : path}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", siteName: SITE_NAME, title, description, url },
    twitter: { card: "summary", title, description },
  };
}

/** Private and signed-in screens: never in the index. */
export const NOINDEX: Metadata = { robots: { index: false, follow: false } };

export function serviceLd({ name, description, path, serviceType }: { name: string; description: string; path: string; serviceType: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name,
    description,
    serviceType,
    url: `${SITE_URL}${path}`,
    provider: { "@id": `${SITE_URL}/#org`, "@type": "Organization", name: SITE_NAME, url: `${SITE_URL}/` },
    audience: { "@type": "PeopleAudience", audienceType: "Parents and guardians" },
  };
}

/** Every public page that describes something Sandlot does, in footer order. */
export const SERVICE_PAGES = [
  { path: "/playdates", label: "Playdates and kids meetups" },
  { path: "/toy-swap", label: "Swap fidgets and toys" },
  { path: "/maps", label: "Find a park" },
] as const;
