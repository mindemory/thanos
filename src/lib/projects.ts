import { cache } from "react";

import { UUID } from "./cards";
import { db, iso, type Db, type Row } from "./db";
import type { ProjectDraft } from "./drafts";
import { labRepos } from "./github";
import { labMembers, type Lab } from "./labs";
import { matchNames, nameKey, slugFor } from "./names";
import type { Paper } from "./papers";
import type { Status } from "./timeline";

// A project is something the lab works on for a while: a study, an analysis, a thesis, a tool. Its
// page says how it stands and when it ran, who is on it, where its code and data are, its Slack
// channel, its papers, and the cards about it. Anyone in the lab can start or change one, and
// every version is kept, as a card's is.

export interface ProjectPerson {
  id: string;
  name: string;
  role: string | null; // their role in the lab now; null once they've been removed from it
}

export interface Project {
  id: string;
  slug: string;
  name: string;
  status: string;
  summary: string;
  started: number | null;
  ended: number | null;
  people: ProjectPerson[];
  others: string[]; // people on it who aren't in Thanos, by name
  repos: string[]; // owner/name on GitHub
  data: string[]; // where its data lives, one place each
  slack: string; // #channel, or a link to it
  papers: Paper[];
  source: string; // where a project kept from a draft came from
  cards: number;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

const lines = (text: unknown) =>
  String(text ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

function papersIn(text: unknown): Paper[] {
  try {
    const list = JSON.parse(String(text || "[]"));
    return Array.isArray(list) ? list.filter((p) => p && typeof p.doi === "string") : [];
  } catch {
    return [];
  }
}

const int = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function toProject(r: Row, people: ProjectPerson[]): Project {
  return {
    id: String(r.id),
    slug: String(r.slug),
    name: String(r.name),
    status: String(r.status),
    summary: String(r.summary),
    started: int(r.started),
    ended: int(r.ended),
    people,
    others: lines(r.others),
    repos: lines(r.repos),
    data: lines(r.data),
    slack: String(r.slack),
    papers: papersIn(r.papers),
    source: String(r.source),
    cards: Number(r.cards ?? 0),
    createdById: (r.created_by as string | null) ?? null,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

/** Every project in a lab, by name, with its people. Few enough to send whole, like the cards. */
export const labProjects = cache(async (labId: string): Promise<Project[]> => {
  const q = await db();
  const [rows, people] = await Promise.all([
    q.query(
      `select pr.*, (select count(*)::int from cards c where c.project_id = pr.id and c.removed_at is null) as cards
       from projects pr where pr.lab_id = $1 and pr.removed_at is null order by lower(pr.name)`,
      [labId],
    ),
    q.query<{ project_id: string; id: string; name: string; role: string | null }>(
      `select pp.project_id, p.id, coalesce(p.name, split_part(p.email, '@', 1)) as name, m.role
       from project_people pp
       join projects pr on pr.id = pp.project_id
       join people p on p.id = pp.person_id
       left join members m on m.lab_id = pr.lab_id and m.person_id = p.id
       where pr.lab_id = $1 and pr.removed_at is null order by name`,
      [labId],
    ),
  ]);
  const on = new Map<string, ProjectPerson[]>();
  for (const p of people) on.set(p.project_id, [...(on.get(p.project_id) ?? []), { id: p.id, name: p.name, role: p.role }]);
  return rows.map((r) => toProject(r, on.get(String(r.id)) ?? []));
});

export async function projectBySlug(labId: string, slug: string): Promise<Project | null> {
  return (await labProjects(labId)).find((p) => p.slug === slug) ?? null;
}

export async function projectInLab(labId: string, id: string): Promise<{ createdBy: string | null } | null> {
  if (!UUID.test(id)) return null;
  const [r] = await (await db()).query<{ created_by: string | null }>(
    "select created_by from projects where id = $1 and lab_id = $2 and removed_at is null",
    [id, labId],
  );
  return r ? { createdBy: r.created_by } : null;
}

export interface ProjectInput {
  name: string;
  status: Status;
  summary: string;
  started: number | null;
  ended: number | null;
  people: string[]; // ids of people in the lab
  others: string[];
  repos: string[];
  data: string[];
  slack: string;
  papers: Paper[];
  note: string;
}

/** What a version keeps: the project as it stood, with people by name, as they were called then. */
export interface Snapshot {
  name: string;
  status: string;
  summary: string;
  started: number | null;
  ended: number | null;
  people: string[];
  others: string[];
  repos: string[];
  data: string[];
  slack: string;
  papers: string[];
}

export interface ProjectVersion {
  id: string;
  snapshot: Snapshot;
  note: string;
  editedBy: string | null;
  editedAt: string;
}

const ids = (list: string[]) => list.filter((id) => UUID.test(id)).join(",");

async function setPeople(q: Db, projectId: string, people: string[]) {
  await q.query("delete from project_people where project_id = $1", [projectId]);
  await q.query(
    `insert into project_people (project_id, person_id)
     select $1, x::uuid from unnest(string_to_array($2, ',')) as x on conflict do nothing`,
    [projectId, ids(people)],
  );
}

async function keepVersion(q: Db, projectId: string, personId: string, input: ProjectInput) {
  const named = await q.query<{ name: string }>(
    `select coalesce(name, split_part(email, '@', 1)) as name from people
     where id = any(string_to_array($1, ',')::uuid[]) order by name`,
    [ids(input.people)],
  );
  const snapshot: Snapshot = {
    name: input.name,
    status: input.status,
    summary: input.summary,
    started: input.started,
    ended: input.ended,
    people: named.map((p) => p.name),
    others: input.others,
    repos: input.repos,
    data: input.data,
    slack: input.slack,
    papers: input.papers.map((p) => p.doi),
  };
  await q.query("insert into project_versions (project_id, snapshot, note, edited_by) values ($1, $2, $3, $4)", [
    projectId,
    JSON.stringify(snapshot),
    input.note,
    personId,
  ]);
}

const columns = (input: ProjectInput) => [
  input.name,
  input.status,
  input.summary,
  input.started,
  input.ended,
  input.others.join("\n"),
  input.repos.join("\n"),
  input.data.join("\n"),
  input.slack,
  JSON.stringify(input.papers),
];

/** A new project, with its people and its first version. Its address comes from its name. */
export async function insertProject(
  labId: string,
  personId: string,
  input: ProjectInput,
  source = "",
): Promise<{ id: string; slug: string }> {
  const q = await db();
  const base = slugFor(input.name);
  for (let n = 1; n < 1000; n++) {
    const slug = n === 1 ? base : `${base.slice(0, 55)}-${n}`;
    const [row] = await q.query<{ id: string }>(
      `insert into projects (lab_id, slug, name, status, summary, started, ended, others, repos, data, slack, papers, source, created_by, updated_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14)
       on conflict (lab_id, slug) do nothing returning id`,
      [labId, slug, ...columns(input), source, personId],
    );
    if (row) {
      await setPeople(q, row.id, input.people);
      await keepVersion(q, row.id, personId, input);
      return { id: row.id, slug };
    }
  }
  throw new Error("No address left for a project of that name.");
}

/** Saves a new version of a project. Its address stays as it was, so links to it keep working. */
export async function updateProject(labId: string, id: string, personId: string, input: ProjectInput): Promise<string | null> {
  const q = await db();
  const [row] = await q.query<{ slug: string }>(
    `update projects set name = $3, status = $4, summary = $5, started = $6, ended = $7, others = $8, repos = $9, data = $10,
       slack = $11, papers = $12, updated_by = $13, updated_at = now()
     where id = $1 and lab_id = $2 and removed_at is null returning slug`,
    [id, labId, ...columns(input), personId],
  );
  if (!row) return null;
  await setPeople(q, id, input.people);
  await keepVersion(q, id, personId, input);
  return row.slug;
}

export async function removeProject(id: string): Promise<void> {
  await (await db()).query("update projects set removed_at = now() where id = $1", [id]);
}

// ── The form ─────────────────────────────────────────────────────────────────

/** Someone a project's form offers to pick. */
export interface PersonOption {
  id: string;
  name: string;
  role: string; // admin, member or alum
}

/** What a project's form starts with: a project as it stands, a draft as found, or nothing yet. */
export interface ProjectValues {
  name: string;
  status: string;
  summary: string;
  started: number | null;
  ended: number | null;
  people: { id: string; name: string }[];
  others: string[];
  repos: string[];
  data: string[];
  slack: string;
  papers: string[]; // DOIs
}

/** Who and what a project's form offers: the lab's people, alumni too, and its repositories on GitHub. */
export async function formChoices(lab: Lab): Promise<{ people: PersonOption[]; repos: string[] }> {
  const [members, { repos }] = await Promise.all([labMembers(lab.id), labRepos(lab.github)]);
  return {
    people: members.map((m) => ({ id: m.id, name: m.name, role: m.role })),
    repos: repos.map((r) => `${r.owner}/${r.name}`),
  };
}

export function projectValues(p: Project): ProjectValues {
  return {
    name: p.name,
    status: p.status,
    summary: p.summary,
    started: p.started,
    ended: p.ended,
    people: p.people.map(({ id, name }) => ({ id, name })),
    others: p.others,
    repos: p.repos,
    data: p.data,
    slack: p.slack,
    papers: p.papers.map((x) => x.doi),
  };
}

/**
 * A draft as its form starts: the people its channel names, matched to the lab's own where the
 * names agree, and with the lab's repositories that share its name, so one found in Slack comes
 * with its code.
 */
export function draftValues(d: ProjectDraft, choices: { people: PersonOption[]; repos: string[] }): ProjectValues {
  const { ids, others } = matchNames(d.people, choices.people);
  const keys = [d.name, d.slack.replace(/^#/, "")].map(nameKey).filter((k) => k.length >= 3);
  const named = choices.repos.filter((r) => keys.includes(nameKey(r.split("/")[1])));
  return {
    name: d.name,
    status: d.status,
    summary: d.summary,
    started: d.started,
    ended: d.ended,
    people: choices.people.filter((p) => ids.includes(p.id)).map(({ id, name }) => ({ id, name })),
    others,
    repos: [...d.repos, ...named.filter((r) => !d.repos.some((x) => x.toLowerCase() === r.toLowerCase()))],
    data: d.data,
    slack: d.slack,
    papers: d.papers,
  };
}

/** Every version of a project, newest first. */
export async function projectVersions(projectId: string): Promise<ProjectVersion[]> {
  const rows = await (await db()).query(
    `select v.id, v.snapshot, v.note, v.edited_at, coalesce(p.name, split_part(p.email, '@', 1)) as edited_by
     from project_versions v left join people p on p.id = v.edited_by where v.project_id = $1 order by v.edited_at desc, v.id desc`,
    [projectId],
  );
  return rows.map((r) => ({
    id: String(r.id),
    snapshot: JSON.parse(String(r.snapshot)) as Snapshot,
    note: String(r.note),
    editedBy: (r.edited_by as string | null) ?? null,
    editedAt: iso(r.edited_at),
  }));
}

/** Every version of every project in a lab, oldest first, for an export. */
export async function labProjectVersions(labId: string): Promise<(ProjectVersion & { projectId: string })[]> {
  const rows = await (await db()).query(
    `select v.id, v.project_id, v.snapshot, v.note, v.edited_at, coalesce(p.name, split_part(p.email, '@', 1)) as edited_by
     from project_versions v join projects pr on pr.id = v.project_id left join people p on p.id = v.edited_by
     where pr.lab_id = $1 and pr.removed_at is null order by v.edited_at, v.id`,
    [labId],
  );
  return rows.map((r) => ({
    id: String(r.id),
    projectId: String(r.project_id),
    snapshot: JSON.parse(String(r.snapshot)) as Snapshot,
    note: String(r.note),
    editedBy: (r.edited_by as string | null) ?? null,
    editedAt: iso(r.edited_at),
  }));
}
