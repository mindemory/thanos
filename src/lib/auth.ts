import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";

import { db, isLocal } from "./db";

// Sign-in is a link by email: no passwords to keep or forget. The link's token and the session's
// id are random, and only their hashes are stored, so a copy of the database can't sign anyone in.

const COOKIE = "thanos_session";
const SESSION_DAYS = 90;
const LINKS_PER_HOUR = 5;

export interface Person {
  id: string;
  email: string;
  name: string | null;
}

export class LinkError extends Error {}

const hash = (secret: string) => createHash("sha256").update(secret).digest("hex");
const secret = () => randomBytes(32).toString("base64url");

/** A path on this site to go to after signing in; anything else (another site, say) is home. */
export function safeNext(next: unknown): string {
  const path = typeof next === "string" ? next : "";
  return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\") ? path : "/";
}

export const currentPerson = cache(async (): Promise<Person | null> => {
  const id = (await cookies()).get(COOKIE)?.value;
  if (!id) return null;
  const q = await db();
  const [person] = await q.query<Person>(
    `select p.id, p.email, p.name from sessions s join people p on p.id = s.person_id
     where s.id_hash = $1 and s.expires_at > now()`,
    [hash(id)],
  );
  return person ?? null;
});

/**
 * People who run a hosted Thanos (THANOS_ADMINS): they can start labs, and open any lab as its
 * admin, to help. Everyone else's say in a lab comes from their role in it.
 */
export function isOperator(person: Person): boolean {
  const listed = (process.env.THANOS_ADMINS ?? "").toLowerCase().split(",").map((s) => s.trim());
  return listed.includes(person.email);
}

/** Starting a lab: for operators, and for anyone on a local copy, which is theirs. */
export function canStartLab(person: Person): boolean {
  return isLocal || isOperator(person);
}

/** A sign-in link for an email address, good once, for twenty minutes. */
export async function createLoginLink(email: string, next: string, origin: string): Promise<string> {
  const q = await db();
  const [{ n }] = await q.query<{ n: number }>(
    "select count(*)::int as n from login_links where email = $1 and created_at > now() - interval '1 hour'",
    [email],
  );
  if (n >= LINKS_PER_HOUR) throw new LinkError("That's a lot of sign-in links for one hour. Use the newest one, or wait a while.");
  await q.query("delete from login_links where expires_at < now() - interval '1 day'");
  const token = secret();
  await q.query(
    "insert into login_links (token_hash, email, next, expires_at) values ($1, $2, $3, now() + interval '20 minutes')",
    [hash(token), email, safeNext(next)],
  );
  return `${origin}/auth/verify?token=${token}`;
}

/** Whom a link would sign in, without using it up: email scanners open links before people do. */
export async function peekLoginLink(token: string): Promise<string | null> {
  const q = await db();
  const [link] = await q.query<{ email: string }>(
    "select email from login_links where token_hash = $1 and used_at is null and expires_at > now()",
    [hash(token)],
  );
  return link?.email ?? null;
}

/** Uses a link: the person it names is signed in on this browser. Returns where to go next. */
export async function redeemLoginLink(token: string): Promise<string | null> {
  const q = await db();
  const [link] = await q.query<{ email: string; next: string }>(
    `update login_links set used_at = now()
     where token_hash = $1 and used_at is null and expires_at > now() returning email, next`,
    [hash(token)],
  );
  if (!link) return null;
  const [person] = await q.query<{ id: string }>(
    "insert into people (email) values ($1) on conflict (email) do update set email = excluded.email returning id",
    [link.email],
  );
  const id = secret();
  await q.query(
    `insert into sessions (id_hash, person_id, expires_at) values ($1, $2, now() + interval '${SESSION_DAYS} days')`,
    [hash(id), person.id],
  );
  (await cookies()).set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: !isLocal,
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  return link.next;
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (id) await (await db()).query("delete from sessions where id_hash = $1", [hash(id)]);
  jar.delete(COOKIE);
}

/** What to call someone who hasn't given a name: the part of their email before the @. */
export function nameOf(person: { name: string | null; email: string }): string {
  return person.name || person.email.split("@")[0];
}
