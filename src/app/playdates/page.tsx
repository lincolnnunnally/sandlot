import type { Metadata } from "next";
import { JsonLd } from "@/components/JsonLd";
import { ServicePage } from "@/components/ServicePage";
import { MEETUP_MODES } from "@/lib/db";
import { pageMetadata, serviceLd } from "@/lib/seo";

const PATH = "/playdates";
const TITLE = "Playdates and kids meetups with families nearby | Sandlot";
const DESCRIPTION =
  "Supervised, in-person playdates with families close to home. Host or join a meetup at a verified place or a park, RSVP for your kids, and check in on the day.";

export const metadata: Metadata = pageMetadata({ title: TITLE, description: DESCRIPTION, path: PATH });

export default function Playdates() {
  return (
    <>
      <JsonLd data={serviceLd({ name: "Playdates and kids meetups", description: DESCRIPTION, path: PATH, serviceType: "Supervised in-person playdate planning for parents" })} />
      <ServicePage
        path={PATH}
        kicker="Playdates"
        title="Playdates and kids meetups with families nearby"
        intro="Kids make real friends nearby. Either parent can host a playdate or help another family, and every meetup is in person with grown-ups there."
        whoFor={[
          "Parents and guardians who want their kids to have friends close to home.",
          "Families new to an area looking for other kids at the same age.",
          "Parents who would host a park day if other families knew about it.",
        ]}
        youGet={[
          ...MEETUP_MODES.map((m) => `${m.label}: ${m.blurb.toLowerCase()}.`),
          "Meetups sorted by age group, so kids land with kids their age.",
          "An RSVP for the kids you are bringing, and a check-in ticket for the day.",
          "Circles: invite a whole group of families you know at once.",
          "A personal invite link to bring a family you already know onto Sandlot.",
        ]}
        steps={[
          "Create a parent account and add your kids by nickname and age group.",
          "Browse playdates near your ZIP code, or host one at a place or a park.",
          "RSVP, show up, and check in. Swap toys while you are there if you like.",
        ]}
        safety={
          <ul>
            <li>Parents only have accounts. Kids never get a login.</li>
            <li>Sandlot never asks for a child&apos;s last name, birthday, photo, or address.</li>
            <li>Hosts agree to be present and keep at least one grown-up for every six kids.</li>
            <li>Every parent can report or block another account.</li>
          </ul>
        }
        cta={{ href: "/", label: "Find a playdate" }}
      />
    </>
  );
}
