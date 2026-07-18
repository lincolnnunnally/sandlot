import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Sandlot",
  description:
    "How Sandlot handles families' information, and our COPPA promises about children's data. We collect the bare minimum and never sell it.",
};

export default function Privacy() {
  return (
    <div className="shell">
      <div className="bar">
        <div className="brand"><div className="mark">🛝</div><b>Sandlot</b></div>
        <a className="btn btn-ghost" style={{ padding: "8px 12px", fontSize: ".82rem" }} href="/">Back to app</a>
      </div>

      <div className="legal">
        <p className="kicker">A short, honest promise about your family's data</p>
        <h1>Privacy Policy</h1>
        <p className="updated">Last updated: July 2026 · Applies to sandlot.unitedundergod.org (and the SwapAround → Sandlot rename)</p>

        <p>
          Sandlot is a fidget-trading, toy-swap, and playdate app for parents and kids —
          supervised, in person. Because children are involved, we built it to collect as little
          information as possible — and this page explains exactly what that means, in plain language.
        </p>
        <p className="pledge">
          We will never sell your data. We will never advertise to you using your data. We will
          never make a child identifiable to strangers.
        </p>

        <p>
          <strong>Who is responsible for your data:</strong> Sandlot is operated by{" "}
          <strong>United Under God, Inc.</strong>, a Georgia corporation. That is the legal entity
          behind every promise on this page. You can reach a real person about privacy at{" "}
          <em>privacy@unitedundergod.org</em>.
        </p>

        <h2>Only parents have accounts</h2>
        <p>
          The account holder on Sandlot is always an adult parent or guardian. Children do not
          get logins, cannot sign in, cannot message anyone, and cannot be contacted through the
          app. Everything a child does on Sandlot happens through their own parent's account,
          under that parent's control.
        </p>

        <h2>What we collect from parents</h2>
        <ul>
          <li><strong>Your email and password</strong> — to create and secure your account. Passwords are stored hashed; we never see them.</li>
          <li><strong>A display name</strong> you choose (for example, "Dana R.") so other families know who to greet.</li>
          <li><strong>A rough area</strong> you optionally type (for example, "Eastside"). Never a street address, and never your exact location.</li>
          <li><strong>An invite code</strong> (optional) — only if a friend shared their personal link, so we can connect your families.</li>
          <li><strong>What you do in the app</strong> — the meetups you RSVP to or host, and the toys you list to swap.</li>
        </ul>

        <h2>What we collect about children (and what we deliberately do not)</h2>
        <p>
          When you add a child to your account, we store only two things about that child:
        </p>
        <ul>
          <li>A <strong>nickname</strong> — a first name or made-up name is completely fine.</li>
          <li>An <strong>age group</strong> (a developmental band, such as "5–6"), which we use to match kids to age-appropriate meetups and toys.</li>
          <li>An optional cartoon <strong>avatar</strong> you pick from a fixed set of emoji.</li>
        </ul>
        <p>
          We do <strong>not</strong> collect a child's last name, date of birth, photograph,
          home address, phone number, precise location, or any other identifier. There is no
          field for it and no way to upload a child's photo. When kids list a toy to swap, the
          picture is always a small cartoon icon of the toy — never a photo of a face.
        </p>
        <p className="callout">
          A child's nickname is visible only to you. Other families at a meetup see the swapped
          toy (its name and a cartoon icon) — not your child's name and not any identifying detail.
        </p>

        <h2>How we use this information</h2>
        <ul>
          <li>To run the core service: show you age-appropriate meetups, let you RSVP or host, and let kids list toys to swap at those meetups.</li>
          <li>To keep families safe: review reports, verify places, connection controls, and act on safety concerns.</li>
          <li>To keep the app working and secure: basic technical logs (used only for security and debugging).</li>
        </ul>
        <p>We do not use your information to advertise, profile you, or build a marketing list.</p>

        <h2>Who can see your family's information</h2>
        <ul>
          <li><strong>You</strong> — always, for your own family.</li>
          <li><strong>Other families at a meetup you join</strong> — see only the toys on that meetup's swap board (a toy name and a cartoon icon), plus the meetup's public details. They do not see your child's name or profile.</li>
          <li><strong>Our small team</strong> — only to run the service, review a report, investigate abuse, or when the law requires it.</li>
          <li><strong>No one else.</strong> We do not share or sell your data to advertisers, data brokers, or any third party for their own use.</li>
        </ul>

        <h2>Verifiable parental consent (COPPA)</h2>
        <p>
          The U.S. Children's Online Privacy Protection Act (COPPA) governs information about
          children under 13. Sandlot is built around it: the only information tied to a child is
          a nickname and an age group, and it is entered by the child's own parent, who holds the
          account. When you add a child, you confirm on that screen that you are the child's parent
          or guardian and consent to storing that minimal profile; we keep a dated record of that
          consent.
        </p>
        <p>
          You are always in control. You can see everything we store about your child right in the
          app. You can refuse to provide any information, and you can stop at any time.
        </p>

        <h2>Your rights — review, delete, and withdraw consent</h2>
        <ul>
          <li><strong>Review</strong> — you can see your child's nickname and age group in the app whenever you like.</li>
          <li><strong>Delete</strong> — to delete your child's profile, or your whole account and everything in it, email <em>privacy@unitedundergod.org</em> and we will remove it promptly.</li>
          <li><strong>Withdraw consent</strong> — deleting the child's profile (or asking us to) stops any further collection about that child. You can keep using Sandlot yourself, or close your account entirely.</li>
        </ul>

        <h2>How long we keep things</h2>
        <ul>
          <li>Your account and your child profiles: for as long as you keep your account. After deletion, a full purge happens within 30 days.</li>
          <li>Security logs: a short window, then deleted, unless tied to an active safety investigation.</li>
        </ul>

        <h2>Security</h2>
        <p>
          Family data lives in a database protected by row-level security, so one family can never
          read another family's private records. We use industry-standard encryption in transit.
          No system is perfect, but we design for least-possible-data so there is little to lose.
        </p>

        <h2>Cookies</h2>
        <p>
          We use one thing that acts like a cookie — a session token that keeps you signed in. We
          do not use advertising cookies or third-party trackers that follow you around the web.
        </p>

        <h2>Changes to this policy</h2>
        <p>
          If we make a meaningful change — especially anything that would change what we collect
          about children — we will post it here with a new date and, where we can, tell account
          holders directly. Small clarifications we will simply publish here.
        </p>

        <h2>Reach us</h2>
        <p>
          A real person reads our inbox. Email <em>privacy@unitedundergod.org</em> for anything about
          your data, or <em>care@unitedundergod.org</em> for everything else. United Under God, Inc.,
          Georgia, U.S.A.
        </p>

        <div className="backrow">
          <a href="/">← Back to Sandlot</a>
          <a href="/terms">Terms of Service →</a>
        </div>
      </div>
    </div>
  );
}
