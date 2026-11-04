import { Frame } from "@/components/Frame";

export const metadata = { title: "Your lab's data" };

// What this page says has to stay true of the code: who can open a lab (labs.ts, requireMember and
// helpingIn), what's emailed (actions.ts), where search and the Slack importer run, what Thanos asks
// other sites (github.ts and papers.ts), and what an export and deleting a lab do. Change one,
// change the other.

const POINTS: { title: string; text: string }[] = [
  {
    title: "It's your lab's",
    text: "Everything a lab puts in Thanos belongs to the lab: its questions, its answers, its projects and every version of them, its drafts, and who's in it. Only people signed in as its members see it. Alumni keep reading until an admin removes them.",
  },
  {
    title: "Whoever runs Thanos can't open your lab",
    text: "The app keeps the people who run this copy of Thanos out of every lab unless its admins let them in, a week at a time, to help with something. While they can, every member sees a note saying so. They do look after the database the app runs on, as anyone hosting a service does, so they could reach it there. They don't, and nothing in the app shows them a lab they haven't been let into.",
  },
  {
    title: "Nothing reads your lab for anyone else",
    text: "Search runs in your own browser. No AI service reads your lab on Thanos's servers, and there are no ads, trackers or analytics. Thanos asks GitHub for the lab's public repositories, by the name of its organization, and asks doi.org about a paper's DOI to show its title; only that name or that DOI goes with each. Turning a lab's Slack into draft cards and projects happens on a lab member's own computer, with a model running there. The drafts reach Thanos when an admin adds them, and wait for the lab's admins to keep or drop; what each was made from is cleared once they decide. The host keeps ordinary server logs for a short while: which pages were asked for, not what was on them.",
  },
  {
    title: "Email, and nothing else",
    text: "Thanos emails sign-in links, an invite when a lab names you, and a note when someone answers a question you asked.",
  },
  {
    title: "Take it with you, or delete it",
    text: "Any member can download everything the lab knows, as Markdown to read or as JSON with every version, whenever they like. A lab's admins can delete the lab, which removes it and everything in it at once. Copies in the database host's backups age out on their own.",
  },
  {
    title: "Secrets stay out",
    text: "Before keeping anything that looks like a card number, a password, a key or a Social Security number, Thanos asks twice. A card should say who holds it and how to ask them.",
  },
];

export default function PrivacyPage() {
  const contact = process.env.THANOS_CONTACT;
  return (
    <Frame wide>
      <h1 className="title-1">How Thanos handles your lab&apos;s data</h1>
      <p className="lede mt-3">Plainly, and true of this copy of Thanos.</p>
      <div className="mt-10 space-y-8">
        {POINTS.map((p) => (
          <section key={p.title}>
            <h2 className="title-2">{p.title}</h2>
            <p className="mt-2 max-w-[34em] leading-relaxed text-muted">{p.text}</p>
          </section>
        ))}
      </div>
      {contact && <p className="mt-12 text-sm text-faint">Questions about any of this: {contact}</p>}
    </Frame>
  );
}
