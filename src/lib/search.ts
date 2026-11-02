import MiniSearch from "minisearch";

// Search over a lab's whole memory, in the browser: every card and repository is on the page
// already, so a search costs nothing and answers as fast as someone types. Words are reduced to
// a common stem (scans, scanning, scanned all search as "scan"), and a question's words also
// look for the other words labs use for the same thing, at a lower weight.
//
// No @/ imports, so `node --test` can run it as is.

export interface Doc {
  id: string;
  kind: "card" | "repo";
  title: string;
  body: string;
  tags: string;
  topic: string;
  open: boolean;
  helped: number;
  href: string;
  updatedAt: string;
}

export interface Hit {
  doc: Doc;
  score: number;
  terms: string[]; // the stems it matched, for highlighting
}

const STOP = new Set(
  "a about an and any are as at be been but by can could do does for from get got has have how i if in into is it its me my of on or our should so than that the their them then there these they this to was we were what when where which who whom why will with would you your".split(
    " ",
  ),
);

/** A light stemmer: enough that the forms of a word meet, and the same at index and query time. */
export function stem(word: string): string {
  let w = word.replace(/'s$/, "");
  const undouble = (s: string) => (/([^aeiouylsz])\1$/.test(s) ? s.slice(0, -1) : s);
  if (w.length > 4 && w.endsWith("ies")) w = `${w.slice(0, -3)}y`;
  else if (w.length > 3 && w.endsWith("s") && !/(ss|us|is)$/.test(w)) w = w.slice(0, -1);
  if (w.length > 7 && w.endsWith("ment")) w = w.slice(0, -4);
  if (w.length > 5 && w.endsWith("ing")) w = undouble(w.slice(0, -3));
  else if (w.length > 4 && w.endsWith("ed")) w = undouble(w.slice(0, -2));
  if (w.length > 4 && w.endsWith("e")) w = w.slice(0, -1);
  return w;
}

function norm(term: string): string | null {
  const t = term.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
  if (!t || STOP.has(t)) return null;
  return stem(t);
}

/** Words, and the parts of mixed-case ones too: PsychRNN is found by "rnn", and fMRI stays fMRI. */
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  for (const word of text.split(/[^\p{L}\p{N}]+/u)) {
    if (!word) continue;
    tokens.push(word);
    const parts = word.replace(/([a-z])([A-Z])/g, "$1 $2").split(" ");
    if (parts.length > 1) tokens.push(...parts.filter((p) => p.length > 1));
  }
  return tokens;
}

// Words that mean the same thing when people in a lab ask. Each group searches as one, at a lower
// weight than the word actually typed.
const SAME: string[][] = [
  ["fmri", "mri", "scan", "scanner", "imaging", "magnet", "bold"],
  ["grant", "fund", "funding", "award", "chartstring", "budget", "charge", "pay", "cost"],
  ["card", "pcard", "credit"],
  ["buy", "purchase", "order", "procure", "vendor"],
  ["reimburse", "reimbursement", "expense", "refund", "receipt"],
  ["travel", "conference", "trip", "flight", "hotel"],
  ["code", "github", "repo", "repository", "script", "software"],
  ["toolbox", "package", "library", "tool"],
  ["cluster", "hpc", "slurm", "supercomputer", "compute"],
  ["data", "dataset", "storage", "drive", "backup", "server"],
  ["irb", "protocol", "consent", "ethics", "approval"],
  ["participant", "subject", "volunteer", "recruit"],
  ["pay", "payment", "compensation", "compensate"],
  ["eye", "eyetracker", "eyelink", "tracker", "gaze"],
  ["meeting", "schedule", "calendar"],
  ["poster", "talk", "slides", "presentation", "template"],
  ["account", "login", "access", "key", "badge"],
  ["new", "onboarding", "start", "first"],
];

const SYNONYMS = new Map<string, string[]>();
for (const group of SAME) {
  const stems = [...new Set(group.map((w) => norm(w)).filter((s): s is string => Boolean(s)))];
  for (const s of stems) SYNONYMS.set(s, [...new Set([...(SYNONYMS.get(s) ?? []), ...stems.filter((o) => o !== s)])]);
}

export interface Index {
  mini: MiniSearch<Doc>;
  byId: Map<string, Doc>;
}

export function buildIndex(docs: Doc[]): Index {
  const mini = new MiniSearch<Doc>({ fields: ["title", "tags", "body"], tokenize, processTerm: norm });
  mini.addAll(docs);
  return { mini, byId: new Map(docs.map((d) => [d.id, d])) };
}

/** The best matches for a query, best first; weak matches far below the best are left out. */
export function search(index: Index, query: string, limit = 8): Hit[] {
  const typed = new Set(tokenize(query).map(norm).filter((s): s is string => Boolean(s)));
  if (!typed.size) return [];
  const results = index.mini.search(query, {
    processTerm: (t) => {
      const n = norm(t);
      return n ? [n, ...(SYNONYMS.get(n) ?? [])] : null;
    },
    boostTerm: (term) => (typed.has(term) ? 1 : 0.35),
    boost: { title: 3, tags: 2, body: 1 },
    prefix: (term) => term.length >= 3,
    fuzzy: (term) => (term.length >= 5 ? 0.2 : false),
    combineWith: "OR",
  });
  const hits = results.flatMap((r) => {
    const doc = index.byId.get(String(r.id));
    if (!doc) return [];
    // Answers before open questions, and answers that have helped people a little higher.
    const score = r.score * (doc.open ? 0.8 : 1) * (1 + 0.12 * Math.log1p(doc.helped));
    return [{ doc, score, terms: r.terms }];
  });
  hits.sort((a, b) => b.score - a.score);
  const best = hits[0]?.score ?? 0;
  return hits.filter((h) => h.score >= best * 0.2).slice(0, limit);
}

/** Splits text into pieces, marking the words a search matched (by stem, or as a typed prefix). */
export function highlight(text: string, terms: string[]): { text: string; hit: boolean }[] {
  if (!terms.length) return [{ text, hit: false }];
  const parts = text.split(/([\p{L}\p{N}]+)/u);
  return parts.filter(Boolean).map((part) => {
    const n = /^[\p{L}\p{N}]+$/u.test(part) ? norm(part) : null;
    return { text: part, hit: Boolean(n && terms.some((t) => n === t || (t.length >= 3 && n.startsWith(t)))) };
  });
}

/** Markdown as plain text, for snippets. */
export function plain(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^[ \t|:-]*-[ \t|:-]*$/gm, " ") // a table's rule under its header, or a horizontal rule
    .replace(/\|/g, " ")
    .replace(/[*_`>#]+/g, "")
    .replace(/^\s*(?:[-+]|\d+[.)])\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** A short piece of an answer, from the first sentence that has a matched word. */
export function snippet(body: string, terms: string[], length = 180): string {
  const text = plain(body);
  if (text.length <= length) return text;
  const sentences = text.split(/(?<=[.!?])\s+/);
  const start = sentences.findIndex((s) => highlight(s, terms).some((p) => p.hit));
  const from = start > 0 ? sentences.slice(start).join(" ") : text;
  return from.length > length ? `${from.slice(0, length).replace(/\s+\S*$/, "")}…` : from;
}
