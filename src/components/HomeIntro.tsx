import { MEETUP_MODES } from "@/lib/db";

/**
 * Public home copy. Server components passed into HomeApp so the signed-out page is in the
 * first HTML response, not only after the client loads. Every line must stay true to the app.
 */

export function HomeHero() {
  return (
    <div className="hero-card" style={{ marginTop: 8 }}>
      <h1 style={{ fontFamily: "var(--fd)", fontWeight: 800, fontSize: "1.5rem", margin: 0 }}>
        Kids make real friends nearby: playdates and toy swaps with families close to home
      </h1>
      <p className="small" style={{ opacity: .95, margin: "8px 0 0" }}>
        Either parent can host a playdate or help another family. Toy swaps and hangouts with kids who live close.
      </p>
    </div>
  );
}

export function HomeAbout() {
  return (
    <div className="home-about">
      <section className="card">
        <h2>Friends for your kids, close to home</h2>
        <p>
          Kids need friends they can actually see: at the park on Saturday, down the street, at the next
          meetup. That gets hard after a move, over a long summer, or when the families you know live across
          town. Sandlot helps parents find other families nearby and set up simple, in-person playdates at
          parks and local places, so kids get to play with kids their age and parents get to know the
          families around them.
        </p>
      </section>

      <section className="card">
        <h2>How it works</h2>
        <ol>
          <li>Create a free parent account and add your kids by nickname and age group.</li>
          <li>Add your ZIP code so you see playdates and toys from families close to you.</li>
          <li>Join a playdate, or host one at a park or a local place. Either parent can host.</li>
          <li>RSVP for the kids you are bringing, then show your door ticket and check in on the day.</li>
        </ol>
      </section>

      <section className="card">
        <h2>What families can do on Sandlot</h2>
        <ul>
          <li>
            <b>Host or join playdates.</b>{" "}
            {MEETUP_MODES.map((m) => `${m.label}: ${m.blurb.toLowerCase()}.`).join(" ")}
          </li>
          <li><b>Meet kids their age.</b> Meetups are sorted by age group, and you can see how many families and kids are going.</li>
          <li><b>Stay in touch.</b> Connect with families you meet and group them into circles for the next playdate.</li>
          <li>
            <b>Swap toys.</b> List fidgets, plushies, books, building sets, games, or outdoor toys with photos, browse what families nearby have listed, offer a
            trade, and swap in person at a meetup.
          </li>
          <li>
            <b>Find a park.</b> Search public parks with playgrounds and open directions in Google Maps or Apple
            Maps, no account needed. Parks around Conyers and Rockdale County, Georgia are checked by hand.
          </li>
          <li><b>Bring your friends.</b> Share a personal invite link with families you already know.</li>
        </ul>
      </section>

      <section className="card">
        <h2>Built for parents, careful with kids</h2>
        <ul>
          <li>Parents only have accounts. Kids never get a login.</li>
          <li>Sandlot never asks for a child&apos;s last name, birthday, photo, or address.</li>
          <li>Playdates happen in person. Hosts agree to be present and keep at least one grown-up for every six kids.</li>
          <li>Places other parents add are marked as not yet verified, and parents stay on-site there.</li>
          <li>Every parent can report or block another account.</li>
          <li>Sandlot never sells your data or uses it to advertise to you.</li>
        </ul>
        <p style={{ marginBottom: 0 }}>
          <a className="btn btn-primary btn-block" style={{ textDecoration: "none" }} href="#signup">Create your free parent account</a>
        </p>
      </section>
    </div>
  );
}
