import { db, isoOrNull, type Row } from "./db";
import { findSensitive } from "./sensitive";
import { isTopic } from "./topics";

// Drafts: cards made from a lab's chat by scripts/import-slack.ts, waiting for an admin to keep,
// edit or drop each one. Nothing in a draft reaches the lab until it's kept. The conversation it
// came from is shown to the admin while they decide, and cleared once they have.

export interface Draft {
  id: string;
  question: string;
  answer: string;
  topic: string;
  tags: string;
  source: string;
  thread: string;
  dated: string | null;
}

type DraftLine = Omit<Draft, "id"> & { origin: string };

/** One line of an import file, checked: anything malformed, or with a secret in it, is left out. */
export function parseDraftLine(line: string): DraftLine | null {
  let r: Record<string, unknown>;
  try {
    r = JSON.parse(line);
  } catch {
    return null;
  }
  const text = (key: string, max: number) => {
    const v = Array.isArray(r[key]) ? (r[key] as unknown[]).join(", ") : r[key]; // a list of tags, say
    return typeof v === "string" ? v.trim().slice(0, max) : "";
  };
  const question = text("question", 300).replace(/\s+/g, " ");
  const answer = text("answer", 20_000);
  const origin = text("origin", 300);
  if (!origin || question.length < 8 || !answer || findSensitive(`${question}\n${answer}`).length) return null;
  const dated = text("dated", 40);
  return {
    origin,
    question,
    answer,
    topic: isTopic(text("topic", 20)) ? text("topic", 20) : "other",
    tags: text("tags", 300),
    source: text("source", 300),
    thread: text("thread", 6000),
    dated: dated && !Number.isNaN(Date.parse(dated)) ? new Date(dated).toISOString() : null,
  };
}

/** Adds an import file's lines to a lab's drafts. One already there (by its origin) isn't added twice. */
export async function addDrafts(labId: string, lines: string[]): Promise<{ added: number; already: number; rejected: number }> {
  const q = await db();
  const tally = { added: 0, already: 0, rejected: 0 };
  for (const line of lines) {
    if (!line.trim()) continue;
    const d = parseDraftLine(line);
    if (!d) {
      tally.rejected++;
      continue;
    }
    const inserted = await q.query(
      `insert into drafts (lab_id, origin, question, answer, topic, tags, source, thread, dated)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) on conflict (lab_id, origin) do nothing returning 1`,
      [labId, d.origin, d.question, d.answer, d.topic, d.tags, d.source, d.thread, d.dated],
    );
    if (inserted.length) tally.added++;
    else tally.already++;
  }
  return tally;
}

function toDraft(r: Row): Draft {
  return {
    id: String(r.id),
    question: String(r.question),
    answer: String(r.answer),
    topic: String(r.topic),
    tags: String(r.tags),
    source: String(r.source),
    thread: String(r.thread),
    dated: isoOrNull(r.dated),
  };
}

/** Drafts still waiting, the newest conversations first: they're the likeliest to still be right. */
export async function waitingDrafts(labId: string, limit: number, offset: number): Promise<Draft[]> {
  const rows = await (await db()).query(
    `select id, question, answer, topic, tags, source, thread, dated from drafts
     where lab_id = $1 and status = 'waiting' order by dated desc nulls last, created_at limit $2 offset $3`,
    [labId, limit, offset],
  );
  return rows.map(toDraft);
}

export async function waitingDraft(labId: string, id: string): Promise<Draft | null> {
  const [r] = await (await db()).query(
    "select id, question, answer, topic, tags, source, thread, dated from drafts where id = $1 and lab_id = $2 and status = 'waiting'",
    [id, labId],
  );
  return r ? toDraft(r) : null;
}

export async function draftCounts(labId: string): Promise<{ waiting: number; kept: number; dropped: number }> {
  const rows = await (await db()).query<{ status: string; n: number }>(
    "select status, count(*)::int as n from drafts where lab_id = $1 group by status",
    [labId],
  );
  const n = (status: string) => rows.find((r) => r.status === status)?.n ?? 0;
  return { waiting: n("waiting"), kept: n("kept"), dropped: n("dropped") };
}

/** Records a decision on a waiting draft and clears its conversation. False if someone already decided. */
export async function decideDraft(labId: string, id: string, personId: string, cardId: string | null): Promise<boolean> {
  const done = await (await db()).query(
    `update drafts set status = $4, decided_by = $3, decided_at = now(), card_id = $5, thread = ''
     where id = $1 and lab_id = $2 and status = 'waiting' returning 1`,
    [id, labId, personId, cardId ? "kept" : "dropped", cardId],
  );
  return done.length > 0;
}

export async function dropWaiting(labId: string, personId: string): Promise<void> {
  await (await db()).query(
    `update drafts set status = 'dropped', decided_by = $2, decided_at = now(), thread = ''
     where lab_id = $1 and status = 'waiting'`,
    [labId, personId],
  );
}
