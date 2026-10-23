import type { Metadata } from "next";
import { JsonLd } from "@/components/JsonLd";
import { ServicePage } from "@/components/ServicePage";
import { TOY_CATEGORIES, TOY_CONDITIONS } from "@/lib/db";
import { pageMetadata, serviceLd } from "@/lib/seo";

const PATH = "/toy-swap";
const TITLE = "Swap fidgets, plushies, and toys with families nearby | Sandlot";
const DESCRIPTION =
  "Trade fidgets, plushies, books, and other toys with families close to home. List a toy, browse nearby, offer a swap, and trade in person at a meetup.";

const categories = TOY_CATEGORIES.map((c) => c.label.replace(/^\S+\s/, "").toLowerCase()).join(", ");
const conditions = TOY_CONDITIONS.map((c) => c.label.toLowerCase()).join(", ");

export const metadata: Metadata = pageMetadata({ title: TITLE, description: DESCRIPTION, path: PATH });

export default function ToySwap() {
  return (
    <>
      <JsonLd data={serviceLd({ name: "Toy and fidget swaps", description: DESCRIPTION, path: PATH, serviceType: "Parent-run toy exchange" })} />
      <ServicePage
        path={PATH}
        kicker="Toy swaps"
        title="Swap fidgets, plushies, and toys with families nearby"
        intro="Outgrown toys go to a kid who wants them, and something new comes home. Parents run every swap, and the trade happens in person."
        whoFor={[
          "Kids who love fidgets and plushies and are ready for something new.",
          "Parents with a shelf of outgrown toys who would rather trade than toss.",
        ]}
        youGet={[
          `Toy listings by type: ${categories}.`,
          `Condition on every listing: ${conditions}.`,
          "Photos, colors, and filters to browse what families near you have listed.",
          "Swap offers you accept or decline, with a message thread for each trade.",
          "A meetup to make the trade in person.",
        ]}
        steps={[
          "Create a parent account and list a toy with a photo.",
          "Browse nearby toys or wait for an offer.",
          "Agree on a swap, pick a meetup, and trade in person.",
        ]}
        safety={
          <ul>
            <li>Parents run every account and every swap.</li>
            <li>Only fidgets and other kids&apos; toys: nothing unsafe, recalled, or with small parts for the under-3 groups.</li>
            <li>Every parent can report a listing or block another account.</li>
          </ul>
        }
        cta={{ href: "/", label: "Start swapping" }}
      />
    </>
  );
}
