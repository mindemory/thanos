import { db, isoOrNull, type Db, type Row } from "./db";
import { monthYear } from "./format";
import { repoOf, type Repo } from "./github";
import { nameKey } from "./names";
import { doiOf } from "./papers";
import { findSensitive } from "./sensitive";
import { finished, isStatus, readYear } from "./timeline";
import { isTopic } from "./topics";

// Drafts: cards made from a lab's chat by scripts/import-slack.ts, waiting for an admin to keep,
// edit or drop each one. Nothing in a draft reaches the lab until it's kept. The conversation it
// came from is shown to the admin while they decide, and cleared once they have. Projects are
// drafted the same way, from the lab's Slack channels and its GitHub, further down.

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

const textIn = (r: Record<string, unknown>) => (key: string, max: number) => {
  const v = Array.isArray(r[key]) ? (r[key] as unknown[]).join(", ") : r[key]; // a list of tags, say
  return typeof v === "string" ? v.trim().slice(0, max) : "";
};

/** One card from an import file, checked: anything malformed, or with a secret in it, is left out. */
function cardLine(r: Record<string, unknown>): DraftLine | null {
  const text = textIn(r);
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

/**
 * Adds an import file's lines to a lab's drafts: cards, and projects (a line with "kind":
 * "project"). One already there (by its origin) isn't added twice, and nor is a project the lab
 * already has.
 */
export async function addDrafts(labId: string, lines: string[]): Promise<{ added: number; already: number; rejected: number }> {
  const q = await db();
  const tally = { added: 0, already: 0, rejected: 0 };
  for (const line of lines) {
    if (!line.trim()) continue;
    let r: Record<string, unknown>;
    try {
      r = JSON.parse(line);
    } catch {
      tally.rejected++;
      continue;
    }
    if (r?.kind === "project") {
      const p = projectLine(r);
      if (!p) tally.rejected++;
      else tally[(await addProjectDraft(q, labId, p)) ? "added" : "already"]++;
      continue;
    }
    const d = r && typeof r === "object" ? cardLine(r) : null;
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

// ── Projects ─────────────────────────────────────────────────────────────────
// A project draft comes from one of the lab's Slack channels (origin slack:#channel, made by the
// importer on a lab member's computer) or one of its GitHub repositories (github:owner/name,
// made here from the Code page's list). Either way it says where it came from, and holds only
// what that source said: a channel's own dates, people and links, or a repository's own name,
// description and dates. The same project from both sources is one draft.

export interface ProjectDraft {
  id: string;
  origin: string;
  name: string;
  summary: string;
  status: string;
  started: number | null;
  ended: number | null;
  people: string[]; // as the source names them; matched to the lab's people when shown
  repos: string[];
  data: string[];
  slack: string;
  papers: string[]; // DOIs, looked up when the draft is kept
  source: string;
  evidence: string; // what the importer read, for the admin deciding; cleared once they have
}

type ProjectDraftLine = Omit<ProjectDraft, "id">;

const listIn = (v: unknown, max: number, each: number) =>
  (Array.isArray(v) ? v : typeof v === "string" ? v.split("\n") : [])
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim().slice(0, each))
    .filter(Boolean)
    .slice(0, max);

/** One project from an import file, checked like a card: malformed, or with a secret in it, it's left out. */
function projectLine(r: Record<string, unknown>): ProjectDraftLine | null {
  const text = textIn(r);
  const origin = text("origin", 300);
  const name = text("name", 100).replace(/\s+/g, " ");
  const summary = text("summary", 2000);
  const people = listIn(r.people, 30, 80);
  const data = listIn(r.data, 10, 300);
  const slack = text("slack", 100);
  if (!origin || name.length < 2 || findSensitive([name, summary, slack, ...people, ...data].join("\n")).length) return null;
  const year = (v: unknown) => (typeof v === "number" || typeof v === "string" ? readYear(String(v)) ?? null : null);
  const status = isStatus(text("status", 20)) ? text("status", 20) : "active";
  return {
    origin,
    name,
    summary,
    status,
    started: year(r.started),
    ended: finished(status) ? year(r.ended) : null,
    people,
    repos: listIn(r.repos, 20, 200)
      .map(repoOf)
      .filter((x): x is string => x !== null),
    data,
    slack,
    papers: listIn(r.papers, 30, 300)
      .map(doiOf)
      .filter((x): x is string => x !== null),
    source: text("source", 300),
    // What the importer read stays only without anything like a password in it, line by line.
    evidence: text("evidence", 6000)
      .split("\n")
      .filter((l) => !findSensitive(l).length)
      .join("\n"),
  };
}

/** The names a project or a draft goes by, to see when two are the same: its name, its channel, its repositories. */
function keysOf(p: { name: string; slack: string; repos: string[] }): string[] {
  const keys = [p.name, p.slack.startsWith("#") ? p.slack.slice(1) : "", ...p.repos.map((r) => r.split("/")[1])].map(nameKey);
  return [...new Set(keys.filter((k) => k.length >= 3))];
}

async function projectKeys(q: Db, labId: string): Promise<{ keys: Set<string>; repos: Set<string> }> {
  const rows = await q.query<{ name: string; slack: string; repos: string }>(
    "select name, slack, repos from projects where lab_id = $1 and removed_at is null",
    [labId],
  );
  const keys = new Set<string>();
  const repos = new Set<string>();
  for (const r of rows) {
    const list = r.repos.split("\n").filter(Boolean);
    for (const k of keysOf({ name: r.name, slack: r.slack, repos: list })) keys.add(k);
    for (const repo of list) repos.add(repo.toLowerCase());
  }
  return { keys, repos };
}

function toProjectDraft(r: Row): ProjectDraft {
  const lines = (v: unknown) => String(v ?? "").split("\n").filter(Boolean);
  return {
    id: String(r.id),
    origin: String(r.origin),
    name: String(r.name),
    summary: String(r.summary),
    status: String(r.status),
    started: r.started === null ? null : Number(r.started),
    ended: r.ended === null ? null : Number(r.ended),
    people: lines(r.people),
    repos: lines(r.repos),
    data: lines(r.data),
    slack: String(r.slack),
    papers: lines(r.papers),
    source: String(r.source),
    evidence: String(r.evidence),
  };
}

async function insertProjectDraft(q: Db, labId: string, d: ProjectDraftLine): Promise<string | null> {
  const [row] = await q.query<{ id: string }>(
    `insert into project_drafts (lab_id, origin, name, summary, status, started, ended, people, repos, data, slack, papers, source, evidence)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     on conflict (lab_id, origin) do nothing returning id`,
    [
      labId,
      d.origin,
      d.name,
      d.summary,
      d.status,
      d.started,
      d.ended,
      d.people.join("\n"),
      d.repos.join("\n"),
      d.data.join("\n"),
      d.slack,
      d.papers.join("\n"),
      d.source,
      d.evidence,
    ],
  );
  return row?.id ?? null;
}

/**
 * Adds a project draft from the Slack importer, unless the lab has that project already. A
 * repository drafted on its own that turns out to be this channel's project joins this draft.
 */
async function addProjectDraft(q: Db, labId: string, d: ProjectDraftLine): Promise<boolean> {
  const mine = keysOf(d);
  const { keys } = await projectKeys(q, labId);
  if (mine.some((k) => keys.has(k))) return false;
  const id = await insertProjectDraft(q, labId, d);
  if (!id) return false;
  const loose = (
    await q.query("select * from project_drafts where lab_id = $1 and state = 'waiting' and origin like 'github:%'", [labId])
  ).map(toProjectDraft);
  const repos = [...d.repos];
  for (const g of loose) {
    if (!keysOf(g).some((k) => mine.includes(k))) continue;
    for (const repo of g.repos) if (!repos.some((r) => r.toLowerCase() === repo.toLowerCase())) repos.push(repo);
    await q.query("delete from project_drafts where id = $1", [g.id]);
  }
  if (repos.length > d.repos.length) await q.query("update project_drafts set repos = $2 where id = $1", [id, repos.join("\n")]);
  return true;
}

const YEAR = 365 * 24 * 60 * 60 * 1000;

/**
 * Drafts a project for each of the lab's own repositories that no project or draft has yet.
 * Forks are other people's tools, and owner.github.io is a website. A repository that matches a
 * waiting draft by name joins it instead.
 */
export async function draftFromRepos(labId: string, repos: Repo[], now = Date.now()): Promise<{ added: number; joined: number }> {
  const q = await db();
  const tally = { added: 0, joined: 0 };
  const { keys, repos: taken } = await projectKeys(q, labId);
  const drafts = (await q.query("select * from project_drafts where lab_id = $1", [labId])).map((r) => ({
    ...toProjectDraft(r),
    waiting: r.state === "waiting",
  }));
  for (const repo of repos) {
    const full = `${repo.owner}/${repo.name}`;
    const created = Date.parse(repo.createdAt);
    const pushed = Date.parse(repo.pushedAt);
    // Forks are other people's tools, owner.github.io is a website, and an empty repository isn't a project yet.
    if (repo.fork || repo.name.toLowerCase() === `${repo.owner.toLowerCase()}.github.io` || Number.isNaN(pushed)) continue;
    if (taken.has(full.toLowerCase()) || keys.has(nameKey(repo.name))) continue;
    if (drafts.some((d) => d.origin === `github:${full}` || d.repos.some((r) => r.toLowerCase() === full.toLowerCase()))) continue;
    // The same project drafted from its channel: the repository joins that draft while it waits,
    // and once an admin has kept or dropped it, the repository isn't asked about again.
    const twin = drafts.find((d) => keysOf(d).includes(nameKey(repo.name)));
    if (twin) {
      if (twin.waiting) {
        twin.repos.push(full);
        await q.query("update project_drafts set repos = $2 where id = $1 and state = 'waiting'", [twin.id, twin.repos.join("\n")]);
        tally.joined++;
      }
      continue;
    }
    const status = repo.archived ? "done" : now - pushed < YEAR ? "active" : "paused";
    const draft: ProjectDraftLine = {
      origin: `github:${full}`,
      // visual_search reads as "Visual search"; a name with capitals of its own keeps them.
      name: /[A-Z]/.test(repo.name) ? repo.name.replace(/[-_]+/g, " ") : repo.name.replace(/[-_]+/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
      summary: repo.description,
      status,
      started: Number.isNaN(created) ? null : new Date(created).getUTCFullYear(),
      ended: repo.archived ? new Date(pushed).getUTCFullYear() : null,
      people: [],
      repos: [full],
      data: [],
      slack: "",
      papers: [],
      source: [
        `${full} on GitHub`,
        Number.isNaN(created) ? null : `made ${monthYear(repo.createdAt)}`,
        `last changed ${monthYear(repo.pushedAt)}`,
        repo.archived ? "archived" : null,
      ]
        .filter(Boolean)
        .join(", "),
      evidence: "",
    };
    if (findSensitive(`${draft.name}\n${draft.summary}`).length) continue;
    const id = await insertProjectDraft(q, labId, draft);
    if (id) {
      drafts.push({ ...draft, id, waiting: true });
      tally.added++;
    }
  }
  return tally;
}

/** Project drafts still waiting, the latest started first. */
export async function waitingProjectDrafts(labId: string, limit: number, offset: number): Promise<ProjectDraft[]> {
  const rows = await (await db()).query(
    `select * from project_drafts where lab_id = $1 and state = 'waiting'
     order by started desc nulls last, created_at, origin limit $2 offset $3`,
    [labId, limit, offset],
  );
  return rows.map(toProjectDraft);
}

export async function waitingProjectDraft(labId: string, id: string): Promise<ProjectDraft | null> {
  const [r] = await (await db()).query("select * from project_drafts where id = $1 and lab_id = $2 and state = 'waiting'", [id, labId]);
  return r ? toProjectDraft(r) : null;
}

export async function projectDraftCounts(labId: string): Promise<{ waiting: number; kept: number; dropped: number }> {
  const rows = await (await db()).query<{ state: string; n: number }>(
    "select state, count(*)::int as n from project_drafts where lab_id = $1 group by state",
    [labId],
  );
  const n = (state: string) => rows.find((r) => r.state === state)?.n ?? 0;
  return { waiting: n("waiting"), kept: n("kept"), dropped: n("dropped") };
}

/** Records a decision on a waiting project draft and clears what was read for it. False if someone already decided. */
export async function decideProjectDraft(labId: string, id: string, personId: string, state: "kept" | "dropped"): Promise<boolean> {
  const done = await (await db()).query(
    `update project_drafts set state = $4, decided_by = $3, decided_at = now(), evidence = ''
     where id = $1 and lab_id = $2 and state = 'waiting' returning 1`,
    [id, labId, personId, state],
  );
  return done.length > 0;
}

/** Notes which project a kept draft became. */
export async function projectFromDraft(id: string, projectId: string): Promise<void> {
  await (await db()).query("update project_drafts set project_id = $2 where id = $1", [id, projectId]);
}

export async function dropWaitingProjects(labId: string, personId: string): Promise<void> {
  await (await db()).query(
    `update project_drafts set state = 'dropped', decided_by = $2, decided_at = now(), evidence = ''
     where lab_id = $1 and state = 'waiting'`,
    [labId, personId],
  );
}
