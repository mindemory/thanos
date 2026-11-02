import { cache } from "react";

import { db, iso, isoOrNull, type Db, type Row } from "./db";

// A card is one thing the lab knows: a question and its answer. A card with no answer yet is an
// open question. The card holds the current version; every version, the first included, is a
// row in revisions, so the history says who knew what and when.

export interface CardSummary {
  id: string;
  question: string;
  answer: string;
  topic: string;
  tags: string;
  source: string; // where a card kept from the lab's chat came from; empty for one written here
  open: boolean;
  helped: number;
  wanted: number;
  createdAt: string;
  updatedAt: string;
  answeredAt: string | null;
  checkedAt: string | null;
  askedBy: string | null;
  answeredBy: string | null;
}

const who = (alias: string) => `coalesce(${alias}.name, split_part(${alias}.email, '@', 1))`;

const SUMMARY = `
  select c.id, c.question, c.answer, c.topic, c.tags, c.source, c.created_at, c.updated_at, c.answered_at, c.checked_at,
    ${who("pa")} as asked_by, ${who("pb")} as answered_by,
    (select count(*)::int from reactions r where r.card_id = c.id and r.kind = 'helped') as helped,
    (select count(*)::int from reactions r where r.card_id = c.id and r.kind = 'wanted') as wanted
  from cards c
  left join people pa on pa.id = c.asked_by
  left join people pb on pb.id = c.answered_by`;

function toSummary(r: Row): CardSummary {
  return {
    id: String(r.id),
    question: String(r.question),
    answer: String(r.answer),
    topic: String(r.topic),
    tags: String(r.tags),
    source: String(r.source ?? ""),
    open: !r.answer,
    helped: Number(r.helped),
    wanted: Number(r.wanted),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    answeredAt: isoOrNull(r.answered_at),
    checkedAt: isoOrNull(r.checked_at),
    askedBy: (r.asked_by as string | null) ?? null,
    answeredBy: (r.answered_by as string | null) ?? null,
  };
}

/** Every card in a lab, newest change first. A lab's whole memory is small enough to send at once. */
export const labCards = cache(async (labId: string): Promise<CardSummary[]> => {
  const rows = await (await db()).query(`${SUMMARY} where c.lab_id = $1 and c.removed_at is null order by c.updated_at desc`, [labId]);
  return rows.map(toSummary);
});

export interface Revision {
  id: string;
  question: string;
  answer: string;
  note: string;
  editedBy: string | null;
  editedAt: string;
}

export interface CardDetail extends CardSummary {
  askedById: string | null;
  updatedBy: string | null;
  checkedBy: string | null;
  mine: { helped: boolean; wanted: boolean };
  revisions: Revision[];
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function cardDetail(labId: string, id: string, personId: string): Promise<CardDetail | null> {
  if (!UUID.test(id)) return null;
  const q = await db();
  const [r] = await q.query(
    `select s.*, c.asked_by as asked_by_id, ${who("pu")} as updated_by, ${who("pc")} as checked_by,
       exists (select 1 from reactions x where x.card_id = c.id and x.person_id = $3 and x.kind = 'helped') as mine_helped,
       exists (select 1 from reactions x where x.card_id = c.id and x.person_id = $3 and x.kind = 'wanted') as mine_wanted
     from (${SUMMARY} where c.id = $1 and c.lab_id = $2 and c.removed_at is null) s
     join cards c on c.id = s.id
     left join people pu on pu.id = c.updated_by
     left join people pc on pc.id = c.checked_by`,
    [id, labId, personId],
  );
  if (!r) return null;
  const revisions = await q.query(
    `select r.id, r.question, r.answer, r.note, r.edited_at, ${who("p")} as edited_by
     from revisions r left join people p on p.id = r.edited_by where r.card_id = $1 order by r.edited_at desc, r.id desc`,
    [id],
  );
  return {
    ...toSummary(r),
    askedById: (r.asked_by_id as string | null) ?? null,
    updatedBy: (r.updated_by as string | null) ?? null,
    checkedBy: (r.checked_by as string | null) ?? null,
    mine: { helped: Boolean(r.mine_helped), wanted: Boolean(r.mine_wanted) },
    revisions: revisions.map((v) => ({
      id: String(v.id),
      question: String(v.question),
      answer: String(v.answer),
      note: String(v.note),
      editedBy: (v.edited_by as string | null) ?? null,
      editedAt: iso(v.edited_at),
    })),
  };
}

export interface CardInput {
  question: string;
  answer: string;
  topic: string;
  tags: string;
  note: string;
}

async function keepVersion(q: Db, cardId: string, personId: string, input: CardInput) {
  await q.query(
    "insert into revisions (card_id, question, answer, topic, tags, note, edited_by) values ($1, $2, $3, $4, $5, $6, $7)",
    [cardId, input.question, input.answer, input.topic, input.tags, input.note, personId],
  );
}

/** A new card. Written with its answer, it counts as answered, and checked, by its writer. */
export async function insertCard(labId: string, personId: string, input: CardInput): Promise<string> {
  const q = await db();
  const answered = input.answer !== "";
  const [row] = await q.query<{ id: string }>(
    `insert into cards (lab_id, question, answer, topic, tags, asked_by, updated_by,
       answered_by, answered_at, checked_by, checked_at)
     values ($1, $2, $3, $4, $5, $6, $6,
       case when $7 then $6::uuid end, case when $7 then now() end, case when $7 then $6::uuid end, case when $7 then now() end)
     returning id`,
    [labId, input.question, input.answer, input.topic, input.tags, personId, answered],
  );
  await keepVersion(q, row.id, personId, input);
  return row.id;
}

/**
 * Saves a new version of a card. A changed answer is also a check that it's right; the first
 * answer to an open question makes its writer the answerer. Returns who asked, so they can be
 * told, and whether this was that first answer.
 */
export async function updateCard(
  labId: string,
  id: string,
  personId: string,
  input: CardInput,
): Promise<{ firstAnswer: boolean; askedBy: string | null } | null> {
  const q = await db();
  const [before] = await q.query<{ answer: string; asked_by: string | null }>(
    "select answer, asked_by from cards where id = $1 and lab_id = $2 and removed_at is null",
    [id, labId],
  );
  if (!before) return null;
  const firstAnswer = before.answer === "" && input.answer !== "";
  const changed = before.answer !== input.answer && input.answer !== "";
  const cleared = input.answer === "";
  await q.query(
    `update cards set question = $2, answer = $3, topic = $4, tags = $5, updated_at = now(), updated_by = $6,
       answered_by = case when $7 then $6::uuid when $9 then null else answered_by end,
       answered_at = case when $7 then now() when $9 then null else answered_at end,
       checked_by = case when $8 then $6::uuid else checked_by end,
       checked_at = case when $8 then now() else checked_at end
     where id = $1`,
    [id, input.question, input.answer, input.topic, input.tags, personId, firstAnswer, changed, cleared],
  );
  await keepVersion(q, id, personId, input);
  return { firstAnswer, askedBy: before.asked_by };
}

/**
 * A card an admin kept from a draft. They added it, so they're its asker; the people who answered
 * are named in its source, and it counts as answered when they answered, so an old answer is
 * marked as possibly out of date until someone says it's still right.
 */
export async function insertKeptCard(
  labId: string,
  personId: string,
  input: CardInput & { source: string; dated: string | null },
): Promise<string> {
  const q = await db();
  const [row] = await q.query<{ id: string }>(
    `insert into cards (lab_id, question, answer, topic, tags, source, asked_by, updated_by, answered_at)
     values ($1, $2, $3, $4, $5, $6, $7, $7, coalesce($8::timestamptz, now())) returning id`,
    [labId, input.question, input.answer, input.topic, input.tags, input.source, personId, input.dated],
  );
  await keepVersion(q, row.id, personId, input);
  return row.id;
}

export async function cardInLab(labId: string, id: string): Promise<{ askedBy: string | null } | null> {
  if (!UUID.test(id)) return null;
  const [r] = await (await db()).query<{ asked_by: string | null }>(
    "select asked_by from cards where id = $1 and lab_id = $2 and removed_at is null",
    [id, labId],
  );
  return r ? { askedBy: r.asked_by } : null;
}

/** Turns "this helped" or "I need this too" on or off for one person; returns the new count. */
export async function toggleReaction(
  cardId: string,
  personId: string,
  kind: "helped" | "wanted",
): Promise<{ count: number; mine: boolean }> {
  const q = await db();
  const removed = await q.query("delete from reactions where card_id = $1 and person_id = $2 and kind = $3 returning 1", [
    cardId,
    personId,
    kind,
  ]);
  if (!removed.length) {
    await q.query("insert into reactions (card_id, person_id, kind) values ($1, $2, $3) on conflict do nothing", [cardId, personId, kind]);
  }
  const [{ n }] = await q.query<{ n: number }>("select count(*)::int as n from reactions where card_id = $1 and kind = $2", [cardId, kind]);
  return { count: n, mine: !removed.length };
}

export async function markChecked(cardId: string, personId: string): Promise<void> {
  await (await db()).query("update cards set checked_at = now(), checked_by = $2 where id = $1", [cardId, personId]);
}

export async function removeCard(cardId: string): Promise<void> {
  await (await db()).query("update cards set removed_at = now() where id = $1", [cardId]);
}

/** A year without anyone saying an answer is still right, and it may well not be. */
export function mayBeStale(card: Pick<CardSummary, "open" | "checkedAt" | "answeredAt" | "updatedAt">, now = Date.now()): boolean {
  if (card.open) return false;
  const last = Date.parse(card.checkedAt ?? card.answeredAt ?? card.updatedAt);
  return now - last > 365 * 24 * 60 * 60 * 1000;
}

/** How many people have written or asked anything in a lab. */
export async function labContributors(labId: string): Promise<number> {
  const [{ n }] = await (await db()).query<{ n: number }>(
    `select count(distinct r.edited_by)::int as n from revisions r join cards c on c.id = r.card_id
     where c.lab_id = $1 and c.removed_at is null and r.edited_by is not null`,
    [labId],
  );
  return n;
}

export interface ExportRevision extends Revision {
  cardId: string;
  topic: string;
  tags: string;
}

/** Every version of every card in a lab, oldest first, for an export. */
export async function labRevisions(labId: string): Promise<ExportRevision[]> {
  const rows = await (await db()).query(
    `select r.id, r.card_id, r.question, r.answer, r.topic, r.tags, r.note, r.edited_at, ${who("p")} as edited_by
     from revisions r join cards c on c.id = r.card_id left join people p on p.id = r.edited_by
     where c.lab_id = $1 and c.removed_at is null order by r.edited_at, r.id`,
    [labId],
  );
  return rows.map((v) => ({
    id: String(v.id),
    cardId: String(v.card_id),
    question: String(v.question),
    answer: String(v.answer),
    topic: String(v.topic),
    tags: String(v.tags),
    note: String(v.note),
    editedBy: (v.edited_by as string | null) ?? null,
    editedAt: iso(v.edited_at),
  }));
}
