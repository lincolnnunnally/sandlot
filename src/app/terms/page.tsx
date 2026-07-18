import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — Sandlot",
  description:
    "The simple rules that keep Sandlot safe: parents are in charge, meetups are supervised and in person, and safety comes first.",
};

export default function Terms() {
  return (
    <div className="shell">
      <div className="bar">
        <div className="brand"><div className="mark">🛝</div><b>Sandlot</b></div>
        <a className="btn btn-ghost" style={{ padding: "8px 12px", fontSize: ".82rem" }} href="/">Back to app</a>
      </div>

      <div className="legal">
        <p className="kicker">The few rules that keep this place safe</p>
        <h1>Terms of Service</h1>
        <p className="updated">Last updated: July 2026 · Applies to sandlot.unitedundergod.org (and the SwapAround → Sandlot rename)</p>

        <p>
          We tried to write these the way we would want them written for us — short, plain, and
          honest about what we owe each other. By creating an account or using Sandlot, you agree
          to what is below. If something does not sit right, please write us at{" "}
          <em>care@unitedundergod.org</em> before you sign up.
        </p>
        <p>
          <strong>Who we are:</strong> Sandlot is a service of <strong>United Under God, Inc.</strong>,
          a Georgia corporation. When these terms say "we," "us," or "Sandlot," that is who you are
          agreeing with.
        </p>
        <p className="pledge">
          Sandlot helps parents trade fidgets and other toys and set up supervised, in-person
          playdates. It is not a babysitting service, and it is not a substitute for a parent's own
          judgment about who and what is safe for their child.
        </p>

        <h2>Who can use Sandlot</h2>
        <ul>
          <li>You are <strong>18 or older</strong> and the parent or legal guardian of any child you add.</li>
          <li>Every account belongs to an adult. Children do not get accounts and are never asked to sign in.</li>
          <li>You will give accurate information about who you are. Pretending to be someone you are not is grounds for immediate removal.</li>
          <li>Sign up honestly, as a parent or guardian acting in good faith. Don&apos;t create fake accounts or misrepresent who you are.</li>
        </ul>

        <h2>You are always in charge of your child</h2>
        <ul>
          <li>You decide which meetups your child attends. You are responsible for supervising your own child.</li>
          <li>Meetups happen in person, at venues our team has verified, never at a private home arranged through the app.</li>
          <li>When you host a meetup, you agree to be present, keep at least one grown-up for every six kids, and follow the safety guidance in the app.</li>
          <li>Sandlot does not run background checks on other parents. Use your own judgment, stay with your child, and report anything that worries you.</li>
        </ul>

        <h2>How to behave here</h2>
        <p>You are here to trade fidgets and other toys, set up playdates, and connect with other families. You may not use Sandlot to:</p>
        <ul>
          <li>Endanger, harass, exploit, or make inappropriate contact with any child or adult.</li>
          <li>Post anything sexual, violent, hateful, or otherwise inappropriate — zero tolerance for anything that sexualizes or endangers a minor.</li>
          <li>List anything unsafe to swap. Sandlot is for fidgets and other kids' toys only — nothing with small parts for the under-3 groups, and nothing dangerous, recalled, or illegal.</li>
          <li>Collect or share another family's personal information, or try to identify another person's child.</li>
          <li>Spam, scam, run a business, or pull families off to another platform.</li>
        </ul>
        <p>
          We can remove content and suspend or close accounts for any of the above. Where safety is
          involved, we act fast and ask questions later.
        </p>

        <h2>Reporting and blocking</h2>
        <p>
          Every meetup, toy listing, and the app itself carries a way to report a concern to a real
          person on our team, and you can block another family so you no longer see each other's
          meetups or toys. We review every report. In a genuine emergency, always call 911 first —
          a report to us is not an emergency service.
        </p>

        <h2>Swaps happen in person</h2>
        <p>
          Nothing is bought, sold, or shipped through Sandlot. Toys are traded in person at a
          meetup, with grown-ups present. We are not a party to those trades and are not responsible
          for the condition, safety, or ownership of any toy that changes hands.
        </p>

        <h2>Our intellectual property</h2>
        <p>
          The Sandlot name, logo, design, and code are owned by United Under God, Inc. Signing up
          does not give you a license to copy or commercialize them. The content you create (your
          profile, your meetups, your listings) stays yours; you grant us permission to display it
          inside Sandlot to the families you choose to meet.
        </p>

        <h2>Closing your account</h2>
        <p>
          You can close your account and delete your family's information at any time by emailing{" "}
          <em>privacy@unitedundergod.org</em>. See the{" "}
          <a href="/privacy">Privacy Policy</a> for what we keep and for how long.
        </p>

        <h2>Disclaimers and limits</h2>
        <p>
          Sandlot is provided "as is." We do not promise the service will always be available,
          that a meetup will happen as planned, or that another family will treat you and your
          child with care. We connect families; we cannot guarantee the conduct of other people.
        </p>
        <p>
          <strong>To the maximum extent allowed by law,</strong> our total liability for any claim
          arising from your use of Sandlot is limited to the greater of $100 or what you paid us
          in the 12 months before the claim. We are not liable for the conduct of other users, on or
          off the platform.
        </p>

        <h2>Disputes</h2>
        <p>
          If a dispute comes up, we will first try to resolve it directly through good-faith email.
          If that does not work, disputes are governed by the laws of the State of Georgia, U.S.A.,
          where United Under God, Inc. is registered. You keep your right to bring a small-claims
          action.
        </p>

        <h2>Changes to these terms</h2>
        <p>
          If we make a meaningful change, we will post it here with a new date and, where we can,
          tell account holders. Continuing to use Sandlot after a change takes effect counts as
          acceptance.
        </p>

        <h2>Reach us</h2>
        <p>
          <em>care@unitedundergod.org</em> for anything we can help with; <em>legal@unitedundergod.org</em>{" "}
          for formal notices. United Under God, Inc., Georgia, U.S.A.
        </p>

        <div className="backrow">
          <a href="/">← Back to Sandlot</a>
          <a href="/privacy">Privacy Policy →</a>
        </div>
      </div>
    </div>
  );
}
