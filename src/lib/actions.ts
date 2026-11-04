"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { canStartLab, createLoginLink, currentPerson, endSession, LinkError, nameOf, redeemLoginLink, safeNext } from "./auth";
import { cardInLab, insertCard, insertKeptCard, markChecked, removeCard, toggleReaction, updateCard, UUID, type CardInput } from "./cards";
import { db, iso, localTrusted } from "./db";
import {
  addDrafts,
  decideDraft,
  decideProjectDraft,
  draftFromRepos,
  dropWaiting,
  dropWaitingProjects,
  projectFromDraft,
  waitingDraft,
  waitingProjectDraft,
} from "./drafts";
import { githubOwners, labRepos, repoOf } from "./github";
import {
  addMember,
  cancelInvite,
  createLab,
  deleteLab,
  domainAllowed,
  inviteByEmail,
  invitesToday,
  labByInvite,
  labBySlug,
  newInviteCode,
  requireMember,
  roleIn,
  setSupport,
  slugProblem,
  type Lab,
  type Role,
} from "./labs";
import { mailReady, sendMail } from "./mail";
import { onThisComputer, siteOrigin } from "./origin";
import { lookUp, readDois, type Paper } from "./papers";
import { insertProject, labProjects, projectInLab, removeProject, updateProject, type ProjectInput } from "./projects";
import { findSensitive } from "./sensitive";
import { finished, isStatus, readYear, yearOf, type Status } from "./timeline";
import { isTopic } from "./topics";

export interface FormState {
  error?: string;
  sensitive?: string[]; // kinds of secret found; the form asks before saving them
  saved?: boolean;
}

export interface LinkState {
  error?: string;
  sent?: string;
  link?: string; // shown on the page only by a local copy opened on its own computer
}

const field = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUPPORT_DAYS = 7;
const INVITES_PER_DAY = 100;

// ── Signing in ───────────────────────────────────────────────────────────────

export async function requestLink(_: LinkState, form: FormData): Promise<LinkState> {
  const email = field(form, "email").toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) return { error: "That doesn't look like an email address." };
  const origin = await siteOrigin();
  if (!origin) return { error: "This Thanos doesn't know its own address yet. Its operator needs to set THANOS_URL." };
  let link: string;
  try {
    const h = await headers();
    const from = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "";
    link = await createLoginLink(email, safeNext(form.get("next")), origin, from);
  } catch (e) {
    if (e instanceof LinkError) return { error: e.message };
    throw e;
  }
  if (mailReady()) {
    const sent = await sendMail(
      email,
      "Your Thanos sign-in link",
      `Open this link to sign in to Thanos. It works once, for the next 20 minutes:\n\n${link}\n\nIf you didn't ask for it, ignore this email.\n`,
    );
    return sent ? { sent: email } : { error: "The email didn't go out. Try again in a minute." };
  }
  if (await onThisComputer()) {
    console.log(`[thanos] sign-in link for ${email}: ${link}`);
    return { sent: email, link };
  }
  return { error: "Email isn't set up on this Thanos yet (RESEND_API_KEY), so it can't send sign-in links." };
}

export async function confirmLink(form: FormData): Promise<void> {
  const next = await redeemLoginLink(field(form, "token"));
  redirect(next ?? "/login?expired=1");
}

export async function signOut(): Promise<void> {
  await endSession();
  redirect("/");
}

export async function saveName(_: FormState, form: FormData): Promise<FormState> {
  const person = await currentPerson();
  if (!person) redirect("/login");
  const name = field(form, "name").replace(/\s+/g, " ");
  if (!name || name.length > 80) return { error: "Give a name of up to 80 characters." };
  await (await db()).query("update people set name = $1 where id = $2", [name, person.id]);
  revalidatePath("/", "layout");
  if (form.has("next")) redirect(safeNext(form.get("next")));
  return { saved: true };
}

// ── Labs ─────────────────────────────────────────────────────────────────────

export async function joinLab(form: FormData): Promise<void> {
  const person = await currentPerson();
  if (!person) redirect("/login");
  const code = field(form, "code");
  // A local copy lets its owner join any of its labs; anywhere else it takes an invite.
  const lab = code ? await labByInvite(code) : localTrusted ? await labBySlug(field(form, "slug")) : null;
  if (!lab) redirect("/");
  if (!domainAllowed(lab, person.email)) redirect(`/join/${encodeURIComponent(code)}`);
  await addMember(lab.id, person.id);
  revalidatePath("/", "layout");
  redirect(`/${lab.slug}`);
}

function website(raw: string): string | null {
  if (!raw) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString().replace(/\/$/, "") : null;
  } catch {
    return null;
  }
}

function labFields(form: FormData): { error: string } | Omit<Lab, "id" | "slug" | "createdAt" | "supportUntil"> {
  const name = field(form, "name").replace(/\s+/g, " ");
  if (!name || name.length > 80) return { error: "Give the lab a name of up to 80 characters." };
  const site = website(field(form, "website"));
  if (site === null) return { error: "The website should be an address like https://example.edu/lab." };
  const domains = field(form, "domains")
    .toLowerCase()
    .split(",")
    .map((d) => d.trim().replace(/^@/, ""))
    .filter(Boolean);
  if (domains.some((d) => !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d))) return { error: "Email domains look like dartmouth.edu, separated by commas." };
  return {
    name,
    institution: field(form, "institution").slice(0, 80),
    website: site,
    github: githubOwners(field(form, "github")).join(", "),
    domains: domains.join(", "),
  };
}

export async function startLab(_: FormState, form: FormData): Promise<FormState> {
  const person = await currentPerson();
  if (!person) redirect("/login?next=/new");
  if (!canStartLab(person)) return { error: "Only the people who run this Thanos can start a lab here." };
  const fields = labFields(form);
  if ("error" in fields) return fields;
  const slug = (field(form, "slug") || fields.name)
    .toLowerCase()
    .replace(/\blab\b/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const problem = slugProblem(slug);
  if (problem) return { error: `The lab's address: ${problem}` };
  if (await labBySlug(slug)) return { error: `There's already a lab at /${slug}. Pick another address.` };
  // Starting a lab for someone else (its PI, say) makes them its admin and keeps whoever started it out.
  const firstAdmin = field(form, "admin").toLowerCase();
  if (firstAdmin && !EMAIL.test(firstAdmin)) return { error: "The first admin's address doesn't look like an email address." };
  const forSomeoneElse = firstAdmin !== "" && firstAdmin !== person.email;
  await createLab(await db(), { slug, ...fields }, person.id, forSomeoneElse ? firstAdmin : "");
  revalidatePath("/", "layout");
  if (!forSomeoneElse) redirect(`/${slug}`);
  const origin = await siteOrigin();
  if (mailReady() && origin) {
    await sendMail(
      firstAdmin,
      `${fields.name} is ready on Thanos`,
      `${nameOf(person)} started ${fields.name} on Thanos, where a lab keeps what it knows, and made you its admin.\n\nSign in with this address to open it:\n${origin}/login?next=/${slug}\n`,
    );
  }
  redirect(`/?started=${encodeURIComponent(slug)}`);
}

export async function saveLab(_: FormState, form: FormData): Promise<FormState> {
  const { lab, ownAdmin } = await requireMember(field(form, "lab"));
  if (!ownAdmin) return { error: "Only the lab's own admins can change this." };
  const fields = labFields(form);
  if ("error" in fields) return fields;
  await (await db()).query(
    "update labs set name = $2, institution = $3, website = $4, github = $5, domains = $6 where id = $1",
    [lab.id, fields.name, fields.institution, fields.website, fields.github, fields.domains],
  );
  revalidatePath(`/${lab.slug}`, "layout");
  return { saved: true };
}

export async function rotateInvite(slug: string): Promise<void> {
  const { lab, ownAdmin } = await requireMember(slug);
  if (!ownAdmin) return;
  await newInviteCode(lab.id);
  revalidatePath(`/${lab.slug}/settings`);
}

async function adminCount(labId: string): Promise<number> {
  const [{ n }] = await (await db()).query<{ n: number }>(
    "select count(*)::int as n from members where lab_id = $1 and role = 'admin'",
    [labId],
  );
  return n;
}

export async function saveMember(_: FormState, form: FormData): Promise<FormState> {
  const { lab, person, ownAdmin } = await requireMember(field(form, "lab"));
  const who = field(form, "person");
  if (!UUID.test(who)) return { error: "No such person." };
  if (!ownAdmin && who !== person.id) return { error: "Only an admin can change someone else." };
  const title = field(form, "title").slice(0, 60);
  const q = await db();
  const [current] = await q.query<{ role: Role; joined_at: unknown; left_at: unknown }>(
    "select role, joined_at, left_at from members where lab_id = $1 and person_id = $2",
    [lab.id, who],
  );
  if (!current) return { error: "They aren't in this lab." };
  let role = current.role;
  if (ownAdmin && ["admin", "member", "alum"].includes(field(form, "role"))) role = field(form, "role") as Role;
  if (current.role === "admin" && role !== "admin" && (await adminCount(lab.id)) <= 1) {
    return { error: "A lab needs at least one admin. Make someone else an admin first." };
  }
  // The years someone was in the lab, for its History. Only a year is ever typed, so a date
  // changes only when its year does. Someone becoming an alum left today unless a year says
  // otherwise; an alum from before Thanos kept the date isn't given one.
  const since = readYear(field(form, "since"));
  const until = readYear(field(form, "left"));
  if (since === undefined || until === undefined) return { error: "Years are written like 2019, and not in the future." };
  const joined = iso(current.joined_at);
  const wasLeft = current.left_at ? iso(current.left_at) : null;
  const joinedAt = since !== null && since !== yearOf(joined) ? `${since}-01-01T00:00:00Z` : joined;
  let leftAt: string | null = null;
  if (role === "alum") {
    if (until !== null) leftAt = wasLeft && yearOf(wasLeft) === until ? wasLeft : `${until}-01-01T00:00:00Z`;
    else leftAt = current.role === "alum" ? wasLeft : new Date().toISOString();
  }
  if (leftAt && yearOf(leftAt) < yearOf(joinedAt)) return { error: "Someone can't leave the lab before they joined it." };
  await q.query("update members set role = $3, title = $4, joined_at = $5, left_at = $6 where lab_id = $1 and person_id = $2", [
    lab.id,
    who,
    role,
    title,
    joinedAt,
    leftAt,
  ]);
  revalidatePath(`/${lab.slug}`, "layout");
  return { saved: true };
}

export async function removeMember(slug: string, who: string): Promise<void> {
  const { lab, ownAdmin } = await requireMember(slug);
  if (!ownAdmin || !UUID.test(who)) return;
  const q = await db();
  const [current] = await q.query<{ role: Role }>("select role from members where lab_id = $1 and person_id = $2", [lab.id, who]);
  if (!current || (current.role === "admin" && (await adminCount(lab.id)) <= 1)) return;
  // What they wrote stays, under their name; they just can't open the lab any more.
  await q.query("delete from members where lab_id = $1 and person_id = $2", [lab.id, who]);
  revalidatePath(`/${lab.slug}/people`);
}

// ── Cards ────────────────────────────────────────────────────────────────────

function cleanTags(raw: string): string {
  const tags = raw
    .split(",")
    .map((t) => t.trim().toLowerCase().replace(/\s+/g, " "))
    .filter((t) => t && t.length <= 40);
  return [...new Set(tags)].slice(0, 12).join(", ");
}

async function tellAsker(askedBy: string, lab: Lab, cardId: string, question: string, answerer: string) {
  const origin = await siteOrigin();
  if (!mailReady() || !origin) return;
  if (!(await roleIn(lab.id, askedBy))) return; // they've left, or been removed
  const [asker] = await (await db()).query<{ email: string }>("select email from people where id = $1", [askedBy]);
  if (!asker) return;
  await sendMail(
    asker.email,
    `Answered in ${lab.name}: ${question}`,
    `${answerer} answered your question in Thanos:\n\n${question}\n\n${origin}/${lab.slug}/c/${cardId}\n`,
  );
}

/** A card's fields from a form, or what's wrong with them, or the secrets in them not yet confirmed. */
function cardFields(form: FormData): CardInput | FormState {
  const input: CardInput = {
    question: field(form, "question").replace(/\s+/g, " "),
    answer: field(form, "answer").replace(/\r\n?/g, "\n"),
    topic: isTopic(field(form, "topic")) ? field(form, "topic") : "other",
    tags: cleanTags(field(form, "tags")),
    project: UUID.test(field(form, "project")) ? field(form, "project") : null,
    note: field(form, "note").replace(/\s+/g, " ").slice(0, 200),
  };
  if (input.question.length < 8) return { error: "Write the question out in full, so the next person searching finds it." };
  if (input.question.length > 300) return { error: "Keep the question under 300 characters; the detail can go in the answer." };
  if (input.answer.length > 20_000) return { error: "That answer is very long. Split it into a few cards, one question each." };
  if (form.get("confirm") !== "yes") {
    const found = findSensitive(`${input.question}\n${input.answer}\n${input.tags}`);
    if (found.length) return { sensitive: found };
  }
  return input;
}

export async function saveCard(_: FormState, form: FormData): Promise<FormState> {
  const { lab, person } = await requireMember(field(form, "lab"));
  const id = field(form, "id");
  const input = cardFields(form);
  if (!("question" in input)) return input;
  if (input.project && !(await projectInLab(lab.id, input.project))) return { error: "That project is gone. Pick another, or none." };
  let cardId = id;
  if (id) {
    if (!UUID.test(id)) return { error: "That card doesn't exist." };
    const saved = await updateCard(lab.id, id, person.id, input);
    if (!saved) return { error: "That card is gone; someone may have removed it." };
    if (saved.firstAnswer && saved.askedBy && saved.askedBy !== person.id) {
      await tellAsker(saved.askedBy, lab, id, input.question, nameOf(person));
    }
  } else {
    cardId = await insertCard(lab.id, person.id, input);
  }
  revalidatePath(`/${lab.slug}`, "layout");
  redirect(`/${lab.slug}/c/${cardId}${!id && !input.answer ? "?asked=1" : ""}`);
}

export async function react(slug: string, id: string, kind: "helped" | "wanted"): Promise<{ count: number; mine: boolean } | null> {
  const { lab, person } = await requireMember(slug);
  if (kind !== "helped" && kind !== "wanted") return null;
  if (!(await cardInLab(lab.id, id))) return null;
  const result = await toggleReaction(id, person.id, kind);
  revalidatePath(`/${lab.slug}`, "layout");
  return result;
}

export async function checkCard(slug: string, id: string): Promise<void> {
  const { lab, person } = await requireMember(slug);
  if (!(await cardInLab(lab.id, id))) return;
  await markChecked(id, person.id);
  revalidatePath(`/${lab.slug}`, "layout");
}

export async function removeCardAction(slug: string, id: string): Promise<void> {
  const { lab, person, isAdmin } = await requireMember(slug);
  const card = await cardInLab(lab.id, id);
  if (!card || (!isAdmin && card.askedBy !== person.id)) return;
  await removeCard(id);
  revalidatePath(`/${lab.slug}`, "layout");
  redirect(`/${lab.slug}`);
}

// ── Drafts from the lab's chat ───────────────────────────────────────────────

/** Part of an import file, sent a piece at a time so no request gets too big. Admins only. */
export async function uploadDrafts(
  slug: string,
  lines: string[],
): Promise<{ added: number; already: number; rejected: number } | { error: string }> {
  const { lab, isAdmin } = await requireMember(slug);
  if (!isAdmin) return { error: "Only the lab's admins can add drafts." };
  if (!Array.isArray(lines) || lines.length > 1000) return { error: "That piece of the file was too big; try again." };
  const result = await addDrafts(lab.id, lines.filter((l) => typeof l === "string"));
  revalidatePath(`/${lab.slug}`, "layout");
  return result;
}

/** Keeps a draft as a card, with whatever the admin changed in it. */
export async function keepDraft(_: FormState, form: FormData): Promise<FormState> {
  const { lab, person, isAdmin } = await requireMember(field(form, "lab"));
  if (!isAdmin) return { error: "Only the lab's admins can keep drafts." };
  const draft = UUID.test(field(form, "id")) ? await waitingDraft(lab.id, field(form, "id")) : null;
  if (!draft) return { error: "Someone already decided on this draft." };
  const input = cardFields(form);
  if (!("question" in input)) return input;
  if (input.project && !(await projectInLab(lab.id, input.project))) return { error: "That project is gone. Pick another, or none." };
  const cardId = await insertKeptCard(lab.id, person.id, { ...input, note: "Kept from the lab's chat", source: draft.source, dated: draft.dated });
  await decideDraft(lab.id, draft.id, person.id, cardId);
  revalidatePath(`/${lab.slug}`, "layout");
  return { saved: true };
}

export async function dropDraft(slug: string, id: string): Promise<void> {
  const { lab, person, isAdmin } = await requireMember(slug);
  if (!isAdmin || !UUID.test(id)) return;
  await decideDraft(lab.id, id, person.id, null);
  revalidatePath(`/${lab.slug}`, "layout");
}

export async function dropAllWaiting(slug: string): Promise<void> {
  const { lab, person, isAdmin } = await requireMember(slug);
  if (!isAdmin) return;
  await dropWaiting(lab.id, person.id);
  revalidatePath(`/${lab.slug}`, "layout");
}

// ── Projects ─────────────────────────────────────────────────────────────────

const MOST = { people: 40, others: 30, repos: 20, data: 10, papers: 30 };

/** A Slack channel as #name, or a link to it, from what someone typed; null when it's neither. */
function slackOf(raw: string): string | null {
  if (!raw) return "";
  if (/^https:\/\/[\w-]+\.slack\.com\/\S+$/i.test(raw)) return raw.slice(0, 200);
  const name = raw.replace(/^#/, "").toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{0,79}$/.test(name) ? `#${name}` : null;
}

/**
 * A project's fields from a form, or what's wrong with them, or the secrets in them not yet
 * confirmed. Papers new to it are looked up at doi.org, last, once everything else is right; one
 * doi.org doesn't answer for just now is kept by its DOI, and asked about again when it's next saved.
 */
async function projectFields(form: FormData, labId: string, projectId: string | null): Promise<ProjectInput | FormState> {
  const name = field(form, "name").replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 100) return { error: "Give the project a name of up to 100 characters." };
  const status: Status = isStatus(field(form, "status")) ? (field(form, "status") as Status) : "active";
  const summary = field(form, "summary").replace(/\r\n?/g, "\n");
  if (summary.length > 2000) return { error: "Keep the description to a few sentences. The details can go in cards about it." };
  const started = readYear(field(form, "started"));
  const ended = finished(status) ? readYear(field(form, "ended")) : null; // a project still going hasn't ended
  if (started === undefined || ended === undefined) return { error: "Years are written like 2019, and not in the future." };
  if (started && ended && ended < started) return { error: "A project can't end before it started." };
  const picked = (key: string) => [...new Set(form.getAll(key).map((v) => String(v).replace(/\s+/g, " ").trim()))].filter(Boolean);
  const people = picked("people").filter((id) => UUID.test(id));
  const others = picked("others").map((n) => n.slice(0, 80));
  if (people.length > MOST.people || others.length > MOST.others) return { error: "That's a lot of people for one project." };
  const repos: string[] = [];
  for (const raw of picked("repos")) {
    const repo = repoOf(raw);
    if (!repo) return { error: `${raw} isn't a GitHub repository. Give it as owner/name, or its link.` };
    if (!repos.some((r) => r.toLowerCase() === repo.toLowerCase())) repos.push(repo);
  }
  if (repos.length > MOST.repos) return { error: `Give up to ${MOST.repos} repositories.` };
  const data = [...new Set(field(form, "data").split("\n").map((l) => l.trim()).filter(Boolean))];
  if (data.length > MOST.data || data.some((d) => d.length > 300)) return { error: `Give up to ${MOST.data} places for its data, one a line.` };
  const slack = slackOf(field(form, "slack"));
  if (slack === null) return { error: "Give the Slack channel as #name, or a link to it." };
  const papersText = field(form, "papers");
  if (papersText.length > MOST.papers * 300) return { error: `Give up to ${MOST.papers} papers, one DOI a line.` };
  const { dois, wrong } = readDois(papersText);
  if (wrong.length) return { error: `${wrong[0].slice(0, 80)} isn't a DOI. A DOI starts with 10., like 10.1038/s41586-020-2649-2.` };
  if (dois.length > MOST.papers) return { error: `Give up to ${MOST.papers} papers.` };
  if (form.get("confirm") !== "yes") {
    const found = findSensitive([name, summary, slack, ...others, ...data].join("\n"));
    if (found.length) return { sensitive: found };
  }
  // People stay on a project while they're in the lab, or when they were on it already.
  const allowed = await (await db()).query<{ person_id: string }>(
    "select person_id from members where lab_id = $1 union select person_id from project_people where project_id = $2::uuid",
    [labId, projectId],
  );
  const had = projectId ? ((await labProjects(labId)).find((p) => p.id === projectId)?.papers ?? []) : [];
  const papers = await Promise.all(
    dois.map(async (doi): Promise<Paper | null> => {
      const known = had.find((p) => p.doi === doi && p.title);
      if (known) return known;
      const found = await lookUp(doi);
      return found === undefined ? { doi, title: "", detail: "", year: null } : found;
    }),
  );
  const unknown = dois.find((_, i) => papers[i] === null);
  if (unknown) return { error: `doi.org has no paper with the DOI ${unknown}. Check it, or leave it out.` };
  return {
    name,
    status,
    summary,
    started,
    ended,
    people: people.filter((id) => allowed.some((a) => a.person_id === id)),
    others,
    repos,
    data,
    slack,
    papers: papers.filter((p): p is Paper => p !== null),
    note: field(form, "note").replace(/\s+/g, " ").slice(0, 200),
  };
}

/** Starts a project, or saves a new version of one. Anyone in the lab can, as with cards. */
export async function saveProject(_: FormState, form: FormData): Promise<FormState> {
  const { lab, person } = await requireMember(field(form, "lab"));
  const id = field(form, "id");
  if (id && !(await projectInLab(lab.id, id))) return { error: "That project is gone; someone may have removed it." };
  const input = await projectFields(form, lab.id, id || null);
  if (!("name" in input)) return input;
  const slug = id ? await updateProject(lab.id, id, person.id, input) : (await insertProject(lab.id, person.id, input)).slug;
  if (!slug) return { error: "That project is gone; someone may have removed it." };
  revalidatePath(`/${lab.slug}`, "layout");
  redirect(`/${lab.slug}/p/${slug}`);
}

export async function removeProjectAction(slug: string, id: string): Promise<void> {
  const { lab, person, isAdmin } = await requireMember(slug);
  const project = await projectInLab(lab.id, id);
  if (!project || (!isAdmin && project.createdBy !== person.id)) return;
  await removeProject(id);
  revalidatePath(`/${lab.slug}`, "layout");
  redirect(`/${lab.slug}/projects`);
}

/** Keeps a project draft as a project, with whatever the admin changed in it. */
export async function keepProjectDraft(_: FormState, form: FormData): Promise<FormState> {
  const { lab, person, isAdmin } = await requireMember(field(form, "lab"));
  if (!isAdmin) return { error: "Only the lab's admins can keep drafts." };
  const draft = UUID.test(field(form, "id")) ? await waitingProjectDraft(lab.id, field(form, "id")) : null;
  if (!draft) return { error: "Someone already decided on this draft." };
  const input = await projectFields(form, lab.id, null);
  if (!("name" in input)) return input;
  // Claimed before the project is made, so two admins keeping it at once make one project.
  if (!(await decideProjectDraft(lab.id, draft.id, person.id, "kept"))) return { error: "Someone already decided on this draft." };
  const from = draft.origin.startsWith("github:") ? "the lab's GitHub" : "the lab's Slack";
  const { id } = await insertProject(lab.id, person.id, { ...input, note: `Kept from ${from}` }, draft.source);
  await projectFromDraft(draft.id, id);
  revalidatePath(`/${lab.slug}`, "layout");
  return { saved: true };
}

export async function dropProjectDraft(slug: string, id: string): Promise<void> {
  const { lab, person, isAdmin } = await requireMember(slug);
  if (!isAdmin || !UUID.test(id)) return;
  await decideProjectDraft(lab.id, id, person.id, "dropped");
  revalidatePath(`/${lab.slug}`, "layout");
}

export async function dropAllProjectDrafts(slug: string): Promise<void> {
  const { lab, person, isAdmin } = await requireMember(slug);
  if (!isAdmin) return;
  await dropWaitingProjects(lab.id, person.id);
  revalidatePath(`/${lab.slug}`, "layout");
}

/** Drafts a project for each of the lab's own repositories on GitHub that no project has yet. Admins only. */
export async function suggestFromGithub(slug: string): Promise<{ added: number; joined: number } | { error: string }> {
  const { lab, isAdmin } = await requireMember(slug);
  if (!isAdmin) return { error: "Only the lab's admins can add drafts." };
  if (!lab.github) return { error: "The lab has no GitHub organization yet. Its admins can add one in Settings." };
  const { repos, problems } = await labRepos(lab.github);
  if (!repos.length && problems.length) return { error: problems[0] };
  const tally = await draftFromRepos(lab.id, repos);
  revalidatePath(`/${lab.slug}`, "layout");
  return tally;
}

// ── Who can get in ───────────────────────────────────────────────────────────

/** Lets the people who run this Thanos into the lab for a week, to help with something. */
export async function letOperatorsIn(slug: string): Promise<void> {
  const ctx = await requireMember(slug);
  if (!ctx.ownAdmin) return;
  await setSupport(ctx.lab.id, SUPPORT_DAYS);
  revalidatePath(`/${ctx.lab.slug}`, "layout");
}

export async function shutOperatorsOut(slug: string): Promise<void> {
  const ctx = await requireMember(slug);
  if (!ctx.ownAdmin) return;
  await setSupport(ctx.lab.id, 0);
  revalidatePath(`/${ctx.lab.slug}`, "layout");
}

/** Invites people by email: each is in the lab, in the role given, the next time they sign in. */
export async function inviteToLab(_: FormState, form: FormData): Promise<FormState> {
  const { lab, person, ownAdmin } = await requireMember(field(form, "lab"));
  if (!ownAdmin) return { error: "Only the lab's own admins can invite people." };
  const emails = [...new Set(field(form, "emails").toLowerCase().split(/[\s,;]+/).filter(Boolean))];
  if (!emails.length || emails.length > 50) return { error: "Give an email address, or up to 50 separated by commas." };
  const wrong = emails.find((e) => !EMAIL.test(e) || e.length > 254);
  if (wrong) return { error: `${wrong} doesn't look like an email address.` };
  if ((await invitesToday(lab.id)) + emails.length > INVITES_PER_DAY) {
    return { error: `A lab can invite up to ${INVITES_PER_DAY} people a day by email. Share the invite link for more.` };
  }
  const role = field(form, "role") === "admin" ? "admin" : "member";
  const named: string[] = [];
  for (const email of emails) if (await inviteByEmail(lab.id, email, role)) named.push(email);
  const origin = await siteOrigin();
  if (mailReady() && origin) {
    for (const email of named) {
      await sendMail(
        email,
        `You're invited to ${lab.name} on Thanos`,
        `${nameOf(person)} invited you to ${lab.name} on Thanos, where the lab keeps what it knows.\n\nSign in with this address to join:\n${origin}/login?next=/${lab.slug}\n`,
      );
    }
  }
  revalidatePath(`/${lab.slug}/people`);
  return { saved: true };
}

export async function cancelInviteAction(slug: string, email: string): Promise<void> {
  const { lab, ownAdmin } = await requireMember(slug);
  if (!ownAdmin) return;
  await cancelInvite(lab.id, email);
  revalidatePath(`/${lab.slug}/people`);
}

/** Deletes the lab and everything in it. Only its own admins, and only when they type its address. */
export async function deleteLabAction(_: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireMember(field(form, "lab"));
  if (!ctx.ownAdmin) return { error: "Only the lab's own admins can delete it." };
  if (field(form, "confirm") !== ctx.lab.slug) return { error: `Type ${ctx.lab.slug} to say you mean it.` };
  await deleteLab(ctx.lab.id);
  revalidatePath("/", "layout");
  redirect("/?deleted=1");
}
