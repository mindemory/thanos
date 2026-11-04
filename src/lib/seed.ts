import type { Db } from "./db";

// What a new lab starts with. Nothing here is made up about a lab: the starters are questions,
// left open for the people who know, and the only answers are about Thanos itself and the
// lab's own GitHub, which its admin gave.

export interface NewLab {
  slug: string;
  name: string;
  institution: string;
  website: string;
  github: string;
}

/** The labs a local copy starts with: the two Thanos was first made for. */
export const LOCAL_LABS: NewLab[] = [
  { slug: "murray", name: "Murray Lab", institution: "Dartmouth", website: "", github: "murraylab" },
  {
    slug: "clayspace",
    name: "Clay Space Lab",
    institution: "NYU",
    website: "https://clayspacelab.com",
    github: "clayspacelab",
  },
];

/** Questions nearly every lab gets asked again and again, waiting for the first person who knows. */
const STARTERS: { topic: string; question: string; tags: string }[] = [
  { topic: "money", question: "Which grant do we charge fMRI scan time to?", tags: "scanning, chart string" },
  { topic: "money", question: "What's the chart string for lab purchases, and when does it change?", tags: "grants, purchasing" },
  { topic: "money", question: "Who holds the lab card, and how do I ask for a purchase on it?", tags: "card on file, p-card, purchasing" },
  { topic: "money", question: "How do I get reimbursed for conference travel?", tags: "travel, receipts" },
  { topic: "studies", question: "How do we pay participants, and what paperwork does that need?", tags: "participants, payment" },
  { topic: "scanning", question: "How do I book scanner time, and how far ahead?", tags: "booking, mri" },
  { topic: "scanning", question: "What do I need before my first scan session?", tags: "safety, training" },
  { topic: "studies", question: "Which IRB protocol covers my study, and how do I get added to it?", tags: "irb, consent" },
  { topic: "code", question: "Which toolboxes does the lab use, and which versions?", tags: "matlab, python, analysis" },
  { topic: "code", question: "How do I get on the cluster, and where should big jobs run?", tags: "hpc, compute" },
  { topic: "code", question: "Where does raw data live, and how is it backed up?", tags: "storage, backup" },
  { topic: "start", question: "What accounts and keys does a new lab member need?", tags: "onboarding, access" },
  { topic: "life", question: "When is lab meeting, and how do I get on the schedule?", tags: "meetings" },
  { topic: "writing", question: "Is there a lab template for posters and talks?", tags: "poster, slides" },
];

const HOW_IT_WORKS = `Thanos is this lab's memory: what people here have worked out, kept where the next person can find it, long after whoever knew has moved on.

- **Search first.** Most questions have been asked before. Search reads every question and answer, and the other words people use for the same thing.
- **Ask once.** If it isn't here, ask. Your question waits on the Open list until someone who knows answers it.
- **Answer what you know.** Anyone in the lab can answer or improve any card. Every version is kept, with who wrote it, so an edit never loses anything.
- **Say when it's still right.** Chart strings change, grants end, scanners move. *Still right* puts today's date on an answer; one nobody has checked in a year is marked as possibly out of date.
- **Keep projects together.** Each project has a page: who is on it, its code, where its data lives, its Slack channel, its papers and the cards about it. **History** shows the lab year by year.
- **Keep secrets out.** Everyone in the lab can read Thanos, including people who join years from now. Say who holds the card or the password and how to ask them, not the number itself.`;

function codeAnswer(lab: NewLab): string {
  const orgs = lab.github.split(",").map((s) => s.trim()).filter(Boolean);
  const links = orgs.map((o) => `[github.com/${o}](https://github.com/${o})`).join(" and ");
  let answer = `On GitHub: ${links}. The **Code** page lists every public repository, most recently changed first, and search finds them by name and description.`;
  if (lab.website) answer += `\n\nThe lab's website is [${lab.website.replace(/^https?:\/\//, "")}](${lab.website}).`;
  return answer;
}

/** Puts the starter cards into a new lab, each with its first version in the history. */
export async function addStarters(q: Db, labId: string, lab: NewLab): Promise<void> {
  const cards = STARTERS.map((s) => ({ ...s, answer: "" }));
  cards.push({ topic: "start", question: "How does Thanos work?", tags: "thanos, help", answer: HOW_IT_WORKS });
  if (lab.github.trim()) {
    cards.push({ topic: "code", question: "Where is the lab's code?", tags: "github, repositories", answer: codeAnswer(lab) });
  }
  for (const c of cards) {
    const [row] = await q.query<{ id: string }>(
      `insert into cards (lab_id, question, answer, topic, tags, answered_at, checked_at)
       values ($1, $2, $3, $4, $5, case when $3 = '' then null else now() end, case when $3 = '' then null else now() end)
       returning id`,
      [labId, c.question, c.answer, c.topic, c.tags],
    );
    await q.query(
      "insert into revisions (card_id, question, answer, topic, tags, note) values ($1, $2, $3, $4, $5, 'Started the lab with this')",
      [row.id, c.question, c.answer, c.topic, c.tags],
    );
  }
}
