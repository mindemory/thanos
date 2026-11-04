import { ArrowRight, MessageCirclePlus, Plus, Search, TreeDeciduous } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Frame, one } from "@/components/Frame";
import { Note, PRIMARY, QUIET } from "@/components/ui";
import { joinLab, signOut } from "@/lib/actions";
import { acceptInvites, canStartLab, currentPerson, nameOf } from "@/lib/auth";
import { localTrusted } from "@/lib/db";
import { myLabs, otherLabs } from "@/lib/labs";

export const dynamic = "force-dynamic";

const POINTS = [
  {
    icon: Search,
    title: "Search before you ask",
    text: "Search reads every question and answer, and the other words people use for the same thing, so a question is asked once, not every year.",
  },
  {
    icon: MessageCirclePlus,
    title: "Ask once",
    text: "What isn't here goes on the lab's Open list until someone who knows answers it. Then it's there for the next person, and the one after.",
  },
  {
    icon: TreeDeciduous,
    title: "Outlasts everyone",
    text: "Every answer keeps its author and its history. Alumni keep their place, and the whole lab downloads as plain Markdown whenever you like.",
  },
];

function Landing() {
  return (
    <Frame wide>
      <div className="landing-in">
        <p className="eyebrow">For labs, and any group that keeps relearning the same things</p>
        <h1 className="mt-4 font-brand text-5xl leading-[1.05] md:text-6xl">The lab&apos;s memory.</h1>
        <p className="lede mt-5 max-w-xl">
          Which grant pays for scans, what the chart string is, who holds the card, which toolboxes, where the code lives: what a lab
          works out over the years, in one place to search, and still there after the people who knew have moved on.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Link href="/login" className={PRIMARY}>
            Sign in <ArrowRight size={15} aria-hidden="true" />
          </Link>
          <span className="text-sm text-faint">Your lab shares a link to join.</span>
        </div>
      </div>
      <ul className="mt-16 grid gap-3 md:grid-cols-3">
        {POINTS.map((p) => (
          <li key={p.title} className="card p-5">
            <p.icon size={20} className="text-accent" aria-hidden="true" />
            <p className="title-3 mt-3">{p.title}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{p.text}</p>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const person = await currentPerson();
  if (!person) return <Landing />;
  if (!person.name) redirect("/welcome?next=/");
  const query = await searchParams;
  const notIn = one(query.notin);
  const started = one(query.started);
  // Someone already signed in when a lab named them by email is in it from their next visit here.
  await acceptInvites(person.id, person.email);
  const [labs, others] = await Promise.all([myLabs(person.id), localTrusted ? otherLabs(person.id) : Promise.resolve([])]);

  return (
    <Frame wide>
      {notIn && (
        <Note tone="warn" className="mb-8">
          You aren&apos;t in that lab yet. Ask someone there for its invite link.
        </Note>
      )}
      {started && (
        <Note tone="ok" className="mb-8">
          Started /{started}. Its first admin is in it from the moment they sign in, and you aren&apos;t in it.
        </Note>
      )}
      {one(query.deleted) && (
        <Note tone="ok" className="mb-8">
          The lab is deleted, with everything in it.
        </Note>
      )}
      <h1 className="title-1">Hello, {nameOf(person)}</h1>
      <p className="lede mt-3">
        {labs.length ? "Your labs." : "You aren't in a lab yet. Open the invite link someone in your lab shares, and you're in."}
      </p>

      {labs.length > 0 && (
        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {labs.map((lab) => (
            <li key={lab.id}>
              <Link href={`/${lab.slug}`} className="card card-hover block p-5">
                <p className="title-2">{lab.name}</p>
                <p className="mt-1 text-sm text-muted">
                  {[lab.institution, lab.role === "admin" ? "you're an admin" : lab.role === "alum" ? "alum" : null].filter(Boolean).join(" · ")}
                </p>
                <p className="num mt-4 text-sm text-faint">
                  {lab.answered} answered · {lab.open} open
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {others.length > 0 && (
        <section className="mt-12">
          <h2 className="smallcaps">Also on this computer</h2>
          <ul className="mt-3 space-y-2">
            {others.map((lab) => (
              <li key={lab.id} className="tile flex items-center gap-3 p-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-ink">{lab.name}</p>
                  {lab.institution && <p className="text-sm text-muted">{lab.institution}</p>}
                </div>
                <form action={joinLab}>
                  <input type="hidden" name="slug" value={lab.slug} />
                  <button type="submit" className={PRIMARY}>
                    Join
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-faint">A local copy lets you join any of its labs. A hosted one takes an invite link.</p>
        </section>
      )}

      <div className="mt-12 flex flex-wrap items-center gap-2 border-t border-line pt-6">
        {canStartLab(person) && (
          <Link href="/new" className={QUIET}>
            <Plus size={15} aria-hidden="true" /> Start a lab
          </Link>
        )}
        <form action={signOut} className="ml-auto">
          <button type="submit" className={QUIET}>
            Sign out
          </button>
        </form>
      </div>
    </Frame>
  );
}
