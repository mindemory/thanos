"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { canStartLab, createLoginLink, currentPerson, endSession, LinkError, nameOf, redeemLoginLink, safeNext } from "./auth";
import { cardInLab, insertCard, insertKeptCard, markChecked, removeCard, toggleReaction, updateCard, UUID, type CardInput } from "./cards";
import { db, localTrusted } from "./db";
import { addDrafts, decideDraft, dropWaiting, waitingDraft } from "./drafts";
import { githubOwners } from "./github";
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
  const [current] = await q.query<{ role: Role }>("select role from members where lab_id = $1 and person_id = $2", [lab.id, who]);
  if (!current) return { error: "They aren't in this lab." };
  let role = current.role;
  if (ownAdmin && ["admin", "member", "alum"].includes(field(form, "role"))) role = field(form, "role") as Role;
  if (current.role === "admin" && role !== "admin" && (await adminCount(lab.id)) <= 1) {
    return { error: "A lab needs at least one admin. Make someone else an admin first." };
  }
  await q.query("update members set role = $3, title = $4 where lab_id = $1 and person_id = $2", [lab.id, who, role, title]);
  revalidatePath(`/${lab.slug}/people`);
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
