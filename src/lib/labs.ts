import { randomBytes } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { currentPerson, isOperator, type Person } from "./auth";
import { db, iso, isoOrNull, type Db, type Row } from "./db";
import { addStarters, LOCAL_LABS, type NewLab } from "./seed";

// A lab is any group that keeps knowledge together: a research lab, a core facility, a team.
// Members are admins (invite people, edit the lab), members, or alumni, who keep reading and
// answering after they leave; what anyone wrote stays theirs when they go.

export type Role = "admin" | "member" | "alum";

export interface Lab {
  id: string;
  slug: string;
  name: string;
  institution: string;
  website: string;
  github: string;
  domains: string;
  createdAt: string;
  supportUntil: string | null; // while the lab's admins let the people who run Thanos in
}

const COLUMNS = "l.id, l.slug, l.name, l.institution, l.website, l.github, l.domains, l.created_at, l.support_until";

function toLab(r: Row): Lab {
  return {
    id: String(r.id),
    slug: String(r.slug),
    name: String(r.name),
    institution: String(r.institution),
    website: String(r.website),
    github: String(r.github),
    domains: String(r.domains),
    createdAt: iso(r.created_at),
    supportUntil: isoOrNull(r.support_until),
  };
}

export const labBySlug = cache(async (slug: string): Promise<Lab | null> => {
  const [r] = await (await db()).query(`select ${COLUMNS} from labs l where l.slug = $1`, [slug]);
  return r ? toLab(r) : null;
});

export async function labByInvite(code: string): Promise<Lab | null> {
  if (!code) return null;
  const [r] = await (await db()).query(`select ${COLUMNS} from labs l where l.invite_code = $1`, [code]);
  return r ? toLab(r) : null;
}

export async function inviteCode(labId: string): Promise<string> {
  const [r] = await (await db()).query<{ invite_code: string }>("select invite_code from labs where id = $1", [labId]);
  return r.invite_code;
}

export async function newInviteCode(labId: string): Promise<void> {
  await (await db()).query("update labs set invite_code = $2 where id = $1", [labId, randomBytes(9).toString("base64url")]);
}

export interface MyLab extends Lab {
  role: Role;
  answered: number;
  open: number;
}

export async function myLabs(personId: string): Promise<MyLab[]> {
  const rows = await (await db()).query(
    `select ${COLUMNS}, m.role,
       (select count(*)::int from cards c where c.lab_id = l.id and c.removed_at is null and c.answer <> '') as answered,
       (select count(*)::int from cards c where c.lab_id = l.id and c.removed_at is null and c.answer = '') as open
     from members m join labs l on l.id = m.lab_id where m.person_id = $1 order by m.joined_at`,
    [personId],
  );
  return rows.map((r) => ({ ...toLab(r), role: r.role as Role, answered: Number(r.answered), open: Number(r.open) }));
}

/** Labs someone isn't in. Listed only on a local copy, where every lab is the owner's own. */
export async function otherLabs(personId: string): Promise<Lab[]> {
  const rows = await (await db()).query(
    `select ${COLUMNS} from labs l
     where not exists (select 1 from members m where m.lab_id = l.id and m.person_id = $1) order by l.name`,
    [personId],
  );
  return rows.map(toLab);
}

export async function roleIn(labId: string, personId: string): Promise<Role | null> {
  const [r] = await (await db()).query<{ role: Role }>(
    "select role from members where lab_id = $1 and person_id = $2",
    [labId, personId],
  );
  return r?.role ?? null;
}

/** Whether an email may join a lab that only takes some domains (an empty list takes any). */
export function domainAllowed(lab: Lab, email: string): boolean {
  const domains = lab.domains.toLowerCase().split(",").map((d) => d.trim().replace(/^@/, "")).filter(Boolean);
  const own = email.toLowerCase().split("@")[1] ?? "";
  return !domains.length || domains.some((d) => own === d || own.endsWith(`.${d}`));
}

/** Adds someone to a lab; the first to join a lab with no admin becomes its admin. */
export async function addMember(labId: string, personId: string): Promise<void> {
  await (await db()).query(
    `insert into members (lab_id, person_id, role)
     values ($1, $2, case when exists (select 1 from members where lab_id = $1 and role = 'admin') then 'member' else 'admin' end)
     on conflict do nothing`,
    [labId, personId],
  );
}

/**
 * Whether someone who runs this Thanos may open a lab right now: only while its admins have let
 * them in, which every member can see. Otherwise its cards, people and drafts are closed to them.
 */
export function helpingIn(person: Person, lab: Lab): boolean {
  return isOperator(person) && supportOpen(lab);
}

/** Whether a lab's admins have the people who run Thanos let in just now. */
export function supportOpen(lab: Lab): boolean {
  return lab.supportUntil !== null && Date.parse(lab.supportUntil) > Date.now();
}

/** Lets the people who run Thanos into a lab for a week, or (days = 0) shuts them out again. */
export async function setSupport(labId: string, days: number): Promise<void> {
  await (await db()).query(
    "update labs set support_until = case when $2::int > 0 then now() + make_interval(days => $2::int) end where id = $1",
    [labId, days],
  );
}

/** Deletes a lab and everything in it: cards and their versions, drafts, members, invites. */
export async function deleteLab(labId: string): Promise<void> {
  await (await db()).query("delete from labs where id = $1", [labId]);
}

/** Names someone by email; true when they weren't named already, so only they get an email. */
export async function inviteByEmail(labId: string, email: string, role: "admin" | "member"): Promise<boolean> {
  const [r] = await (await db()).query<{ added: boolean }>(
    `insert into invites (lab_id, email, role) values ($1, $2, $3)
     on conflict (lab_id, email) do update set role = excluded.role returning (xmax = 0) as added`,
    [labId, email.toLowerCase(), role],
  );
  return Boolean(r?.added);
}

export async function invitesToday(labId: string): Promise<number> {
  const [{ n }] = await (await db()).query<{ n: number }>(
    "select count(*)::int as n from invites where lab_id = $1 and created_at > now() - interval '1 day'",
    [labId],
  );
  return n;
}

export async function pendingInvites(labId: string): Promise<{ email: string; role: string; createdAt: string }[]> {
  const rows = await (await db()).query("select email, role, created_at from invites where lab_id = $1 order by created_at", [labId]);
  return rows.map((r) => ({ email: String(r.email), role: String(r.role), createdAt: iso(r.created_at) }));
}

export async function cancelInvite(labId: string, email: string): Promise<void> {
  await (await db()).query("delete from invites where lab_id = $1 and email = $2", [labId, email.toLowerCase()]);
}

export interface LabContext {
  person: Person;
  lab: Lab;
  role: Role | null;
  isAdmin: boolean; // the lab's admins, and someone running Thanos while they're let in to help
  ownAdmin: boolean; // the lab's own admins only: people, the invite link, letting operators in, deleting
}

/**
 * The lab a page is about, and who is looking, for pages only members may see. Anyone else is
 * sent to sign in, or home with a note that they aren't in the lab.
 */
export const requireMember = cache(async (slug: string): Promise<LabContext> => {
  const person = await currentPerson();
  if (!person) redirect(`/login?next=/${encodeURIComponent(slug)}`);
  const lab = await labBySlug(slug);
  if (!lab) notFound();
  const role = await roleIn(lab.id, person.id);
  const helping = helpingIn(person, lab);
  if (!role && !helping) redirect(`/?notin=${encodeURIComponent(slug)}`);
  if (!person.name) redirect(`/welcome?next=/${encodeURIComponent(slug)}`);
  return { person, lab, role, isAdmin: role === "admin" || helping, ownAdmin: role === "admin" };
});

// Paths Thanos uses itself, which a lab's address can't take.
const RESERVED = new Set(["login", "auth", "welcome", "join", "new", "api", "_next", "icon.svg", "favicon.ico"]);

export function slugProblem(slug: string): string | null {
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)) {
    return "Use 3 to 40 lowercase letters, numbers and dashes, starting and ending with a letter or number.";
  }
  if (RESERVED.has(slug)) return "Thanos uses that address itself. Try another.";
  return null;
}

/**
 * Starts a lab. Its first admin is whoever started it, or, when they name someone else by email,
 * that person, from the moment they first sign in; then whoever started it never joins it.
 */
export async function createLab(q: Db, lab: NewLab, creatorId: string | null, firstAdmin = ""): Promise<string> {
  const [row] = await q.query<{ id: string }>(
    `insert into labs (slug, name, institution, website, github, invite_code)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [lab.slug, lab.name, lab.institution, lab.website, lab.github, randomBytes(9).toString("base64url")],
  );
  if (firstAdmin) await q.query("insert into invites (lab_id, email, role) values ($1, $2, 'admin')", [row.id, firstAdmin.toLowerCase()]);
  else if (creatorId) await q.query("insert into members (lab_id, person_id, role) values ($1, $2, 'admin')", [row.id, creatorId]);
  await addStarters(q, row.id, lab);
  return row.id;
}

/** The first start of a local copy: the labs it was made for, with their starter cards. */
export async function seedLocalLabs(q: Db): Promise<void> {
  const [{ n }] = await q.query<{ n: number }>("select count(*)::int as n from labs");
  if (n > 0) return;
  for (const lab of LOCAL_LABS) await createLab(q, lab, null);
}

export interface Member {
  id: string;
  email: string;
  name: string;
  role: Role;
  title: string;
  joinedAt: string;
  answered: number;
  asking: number;
  edits: number;
}

/** Everyone in a lab, admins first and alumni last, with what each has given it. */
export async function labMembers(labId: string): Promise<Member[]> {
  const rows = await (await db()).query(
    `select p.id, p.email, coalesce(p.name, split_part(p.email, '@', 1)) as name, m.role, m.title, m.joined_at,
       (select count(*)::int from cards c where c.lab_id = m.lab_id and c.removed_at is null and c.answered_by = p.id) as answered,
       (select count(*)::int from cards c where c.lab_id = m.lab_id and c.removed_at is null and c.asked_by = p.id and c.answer = '') as asking,
       (select count(*)::int from revisions r join cards c on c.id = r.card_id where c.lab_id = m.lab_id and r.edited_by = p.id) as edits
     from members m join people p on p.id = m.person_id where m.lab_id = $1
     order by case m.role when 'admin' then 0 when 'member' then 1 else 2 end, m.joined_at`,
    [labId],
  );
  return rows.map((r) => ({
    id: String(r.id),
    email: String(r.email),
    name: String(r.name),
    role: r.role as Role,
    title: String(r.title),
    joinedAt: iso(r.joined_at),
    answered: Number(r.answered),
    asking: Number(r.asking),
    edits: Number(r.edits),
  }));
}
