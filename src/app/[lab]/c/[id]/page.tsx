import { BadgeCheck, ChevronDown, Pencil, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { one } from "@/components/Frame";
import { ConfirmSubmit } from "@/components/client";
import { Reaction } from "@/components/lab/Reaction";
import { Markdown } from "@/components/Markdown";
import { TopicIcon } from "@/components/TopicIcon";
import { BUTTON, Note, PRIMARY, QUIET } from "@/components/ui";
import { checkCard, removeCardAction } from "@/lib/actions";
import { cardDetail, mayBeStale, type CardDetail, type Revision } from "@/lib/cards";
import { ago, monthYear } from "@/lib/format";
import { requireMember } from "@/lib/labs";
import { topicOf } from "@/lib/topics";

const THANOS = "Thanos"; // who wrote what a lab started with

/** Who asked and who answered, in a line. */
function Byline({ card }: { card: CardDetail }) {
  const parts: string[] = [];
  // A card answered well after it was made was a question first; one written with its answer wasn't.
  const askedFirst = card.answeredAt !== null && Date.parse(card.answeredAt) - Date.parse(card.createdAt) > 60_000;
  if (card.open) {
    parts.push(`Asked by ${card.askedBy ?? THANOS}, ${ago(card.createdAt)}`);
  } else if (askedFirst && card.askedBy !== card.answeredBy) {
    parts.push(`Asked by ${card.askedBy ?? THANOS}`, `answered by ${card.answeredBy ?? THANOS}, ${ago(card.answeredAt ?? card.updatedAt)}`);
  } else if (card.askedBy && card.askedBy !== card.answeredBy) {
    parts.push(`Asked by ${card.askedBy}`, `answered by ${card.answeredBy ?? THANOS}, ${ago(card.answeredAt ?? card.updatedAt)}`);
  } else {
    parts.push(`Written by ${card.answeredBy ?? THANOS}, ${ago(card.answeredAt ?? card.createdAt)}`);
  }
  if (!card.open && card.updatedBy && card.updatedAt !== card.answeredAt && card.updatedBy !== card.answeredBy) {
    parts.push(`edited by ${card.updatedBy}, ${ago(card.updatedAt)}`);
  }
  return <p className="mt-3 text-sm text-muted">{parts.join(" · ")}</p>;
}

/** What each version did, judged against the one before it. */
function verb(version: Revision, before: Revision | undefined): string {
  if (!before) return version.answer ? "Written" : "Asked";
  if (!before.answer && version.answer) return "Answered";
  if (version.question !== before.question && version.answer === before.answer) return "Question reworded";
  return "Edited";
}

function History({ revisions }: { revisions: Revision[] }) {
  if (revisions.length < 2) return null;
  return (
    <details className="group mt-10">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm text-muted hover:text-ink">
        <ChevronDown size={15} className="transition-transform group-open:rotate-180" aria-hidden="true" />
        History · {revisions.length} versions
      </summary>
      <ol className="mt-4 space-y-2 border-l border-line pl-4">
        {revisions.map((v, i) => (
          <li key={v.id}>
            <details className="group/v">
              <summary className="cursor-pointer list-none text-sm">
                <span className="text-ink">{verb(v, revisions[i + 1])}</span>
                <span className="text-muted">
                  {" "}
                  by {v.editedBy ?? THANOS} · {monthYear(v.editedAt)}
                </span>
                {v.note && <span className="text-faint"> · {v.note}</span>}
              </summary>
              <div className="tile mt-2 p-3.5">
                <p className="text-sm font-medium">{v.question}</p>
                {v.answer ? (
                  <div className="mt-2">
                    <Markdown source={v.answer} compact />
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-faint">No answer yet at this point.</p>
                )}
              </div>
            </details>
          </li>
        ))}
      </ol>
    </details>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ lab: string; id: string }> }) {
  const { lab: slug, id } = await params;
  const { lab, person } = await requireMember(slug);
  return { title: (await cardDetail(lab.id, id, person.id))?.question ?? "Not found" };
}

export default async function CardPage({
  params,
  searchParams,
}: {
  params: Promise<{ lab: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { lab: slug, id } = await params;
  const { lab, person, isAdmin } = await requireMember(slug);
  const card = await cardDetail(lab.id, id, person.id);
  if (!card) notFound();
  const justAsked = Boolean(one((await searchParams).asked)) && card.open;
  const topic = topicOf(card.topic);
  const stale = mayBeStale(card);
  const canRemove = isAdmin || card.askedById === person.id;
  const tags = card.tags.split(",").map((t) => t.trim()).filter(Boolean);

  return (
    <article className="screen-in">
      <Link href={`/${slug}/t/${topic.id}`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <TopicIcon topic={topic.id} size={14} /> {topic.label}
      </Link>
      <h1 className="title-1 mt-3">{card.question}</h1>
      <Byline card={card} />

      {justAsked && (
        <Note tone="ok" className="mt-6">
          Asked. It&apos;s on the Open list now, where anyone in the lab who knows can answer it.
        </Note>
      )}

      {card.open ? (
        <div className="card card-priority mt-6 p-5 md:p-6">
          <p className="title-2">Nobody has answered this yet</p>
          <p className="mt-2 leading-relaxed text-muted">
            {card.wanted > 1
              ? `${card.wanted} people need it.`
              : "If you know, even part of it, write it down: the next person will start from there."}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Link href={`/${slug}/c/${card.id}/edit`} className={PRIMARY}>
              <Pencil size={15} aria-hidden="true" /> Answer it
            </Link>
            <Reaction slug={slug} id={card.id} kind="wanted" count={card.wanted} mine={card.mine.wanted} />
          </div>
        </div>
      ) : (
        <>
          <div className="card mt-6 p-5 md:p-6">
            <Markdown source={card.answer} />
          </div>
          {stale ? (
            <p className="mt-3 flex items-start gap-2 text-sm text-warn-ink">
              <TriangleAlert size={15} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
              Nobody has said this is still right since {monthYear(card.checkedAt ?? card.answeredAt ?? card.updatedAt)}, so it may be out of
              date. If you know it is, say so below; if it isn&apos;t, fix it.
            </p>
          ) : (
            card.checkedAt && (
              <p className="mt-3 flex items-center gap-2 text-sm text-ok-ink">
                <BadgeCheck size={15} aria-hidden="true" />
                Checked {ago(card.checkedAt)} by {card.checkedBy ?? THANOS}
              </p>
            )
          )}
        </>
      )}

      {tags.length > 0 && (
        <p className="mt-5 flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span key={t} className="rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-xs text-muted">
              {t}
            </span>
          ))}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-5">
        {!card.open && (
          <>
            <Reaction slug={slug} id={card.id} kind="helped" count={card.helped} mine={card.mine.helped} />
            <form action={checkCard.bind(null, slug, card.id)}>
              <button type="submit" className={BUTTON}>
                <BadgeCheck size={15} aria-hidden="true" /> Still right
              </button>
            </form>
          </>
        )}
        <Link href={`/${slug}/c/${card.id}/edit`} className={BUTTON}>
          <Pencil size={15} aria-hidden="true" /> {card.open ? "Edit question" : "Edit"}
        </Link>
        {canRemove && (
          <form action={removeCardAction.bind(null, slug, card.id)} className="ml-auto">
            <ConfirmSubmit
              question="Remove this card? It disappears from search and lists; its history stays in the database."
              className={QUIET}
            >
              Remove
            </ConfirmSubmit>
          </form>
        )}
      </div>

      <History revisions={card.revisions} />
    </article>
  );
}
