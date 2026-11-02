import Link from "next/link";
import { notFound } from "next/navigation";

import { CardRow } from "@/components/lab/CardRow";
import { TopicIcon } from "@/components/TopicIcon";
import { PRIMARY } from "@/components/ui";
import { labCards } from "@/lib/cards";
import { requireMember } from "@/lib/labs";
import { isTopic, topicOf } from "@/lib/topics";

export async function generateMetadata({ params }: { params: Promise<{ topic: string }> }) {
  const { topic } = await params;
  return { title: topicOf(topic).label };
}

export default async function TopicPage({ params }: { params: Promise<{ lab: string; topic: string }> }) {
  const { lab: slug, topic: id } = await params;
  if (!isTopic(id)) notFound();
  const { lab } = await requireMember(slug);
  const topic = topicOf(id);
  const cards = (await labCards(lab.id)).filter((c) => c.topic === id);
  const answered = cards.filter((c) => !c.open).sort((a, b) => b.helped - a.helped || b.updatedAt.localeCompare(a.updatedAt));
  const open = cards.filter((c) => c.open);

  return (
    <div className="screen-in">
      <p className="eyebrow flex items-center gap-2">
        <TopicIcon topic={id} size={14} /> {lab.name}
      </p>
      <h1 className="title-1 mt-2">{topic.label}</h1>
      <p className="lede mt-3">{topic.hint}.</p>
      {answered.length > 0 && (
        <ul className="mt-8 space-y-2">
          {answered.map((c) => (
            <CardRow key={c.id} slug={slug} card={c} />
          ))}
        </ul>
      )}
      {open.length > 0 && (
        <section className="mt-10">
          <h2 className="smallcaps mb-3">Asked, not answered yet</h2>
          <ul className="space-y-2">
            {open.map((c) => (
              <CardRow key={c.id} slug={slug} card={c} />
            ))}
          </ul>
        </section>
      )}
      {!cards.length && <p className="mt-8 text-muted">Nothing here yet.</p>}
      <Link href={`/${slug}/ask?mode=write`} className={`${PRIMARY} mt-10`}>
        Add something you know
      </Link>
    </div>
  );
}
