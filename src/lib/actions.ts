"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { canStartLab, createLoginLink, currentPerson, endSession, LinkError, nameOf, redeemLoginLink, safeNext } from "./auth";
import { cardInLab, insertCard, insertKeptCard, markChecked, removeCard, toggleReaction, updateCard, UUID, type CardInput } from "./cards";
import { db, isLocal } from "./db";
import { addDrafts, decideDraft, dropWaiting, waitingDraft } from "./drafts";
import { githubOwners } from "./github";
import {
  addMember,
  createLab,
  domainAllowed,
  labByInvite,
  labBySlug,
  newInviteCode,
  requireMember,
  slugProblem,
  type Lab,
  type Role,
} from "./labs";
import { mailReady, sendMail } from "./mail";
import { onThisComputer, siteOrigin } from "./origin";
import { findSensitive } from "./sensitive";
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

// ── Signing in ───────────────────────────────────────────────────────────────

export async function requestLink(_: LinkState, form: FormData): Promise<LinkState> {
  const email = field(form, "email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return { error: "That doesn't look like an email address." };
  const origin = await siteOrigin();
  if (!origin) return { error: "This Thanos doesn't know its own address yet. Its operator needs to set THANOS_URL." };
  let link: string;
  try {
    link = await createLoginLink(email, safeNext(form.get("next")), origin);
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
  const lab = code ? await labByInvite(code) : isLocal ? await labBySlug(field(form, "slug")) : null;
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

function labFields(form: FormData): { error: string } | Omit<Lab, "id" | "slug" | "createdAt"> {
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
  await createLab(await db(), { slug, ...fields }, person.id);
  revalidatePath("/", "layout");
  redirect(`/${slug}`);
}

export async function saveLab(_: FormState, form: FormData): Promise<FormState> {
  const { lab, isAdmin } = await requireMember(field(form, "lab"));
  if (!isAdmin) return { error: "Only the lab's admins can change this." };
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
  const { lab, isAdmin } = await requireMember(slug);
  if (!isAdmin) return;
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
  const { lab, person, isAdmin } = await requireMember(field(form, "lab"));
  const who = field(form, "person");
  if (!UUID.test(who)) return { error: "No such person." };
  if (!isAdmin && who !== person.id) return { error: "Only an admin can change someone else." };
  const title = field(form, "title").slice(0, 60);
  const q = await db();
  const [current] = await q.query<{ role: Role }>("select role from members where lab_id = $1 and person_id = $2", [lab.id, who]);
  if (!current) return { error: "They aren't in this lab." };
  let role = current.role;
  if (isAdmin && ["admin", "member", "alum"].includes(field(form, "role"))) role = field(form, "role") as Role;
  if (current.role === "admin" && role !== "admin" && (await adminCount(lab.id)) <= 1) {
    return { error: "A lab needs at least one admin. Make someone else an admin first." };
  }
  await q.query("update members set role = $3, title = $4 where lab_id = $1 and person_id = $2", [lab.id, who, role, title]);
  revalidatePath(`/${lab.slug}/people`);
  return { saved: true };
}

export async function removeMember(slug: string, who: string): Promise<void> {
  const { lab, isAdmin } = await requireMember(slug);
  if (!isAdmin || !UUID.test(who)) return;
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
