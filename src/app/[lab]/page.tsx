import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { CardRow } from "@/components/lab/CardRow";
import { HomeSearch } from "@/components/lab/HomeSearch";
import { TopicIcon } from "@/components/TopicIcon";
import { QUIET } from "@/components/ui";
import { labCards, labContributors, mayBeStale } from "@/lib/cards";
import { plural } from "@/lib/format";
import { requireMember } from "@/lib/labs";
import { TOPICS } from "@/lib/topics";

function Section({ title, more, children }: { title: string; more?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="smallcaps">{title}</h2>
        {more}
      </div>
      {children}
    </section>
  );
}

export default async function LabHome({ params }: { params: Promise<{ lab: string }> }) {
  const { lab: slug } = await params;
  const { lab } = await requireMember(slug);
  const [cards, contributors] = await Promise.all([labCards(lab.id), labContributors(lab.id)]);
  const answered = cards.filter((c) => !c.open);
  const open = cards
    .filter((c) => c.open)
    .sort((a, b) => b.wanted - a.wanted || a.createdAt.localeCompare(b.createdAt));
  const stale = answered.filter((c) => mayBeStale(c)).slice(0, 5);
  const recent = cards.filter((c) => !c.open || c.askedBy).slice(0, 6);
  const perTopic = new Map(TOPICS.map((t) => [t.id as string, 0]));
  for (const c of answered) perTopic.set(c.topic, (perTopic.get(c.topic) ?? 0) + 1);

  return (
    <div className="screen-in">
      <p className="eyebrow">{[lab.name, lab.institution].filter(Boolean).join(" · ")}</p>
      <h1 className="title-1 mt-2">What do you need to know?</h1>
      <p className="lede mt-3">
        {plural(answered.length, "answer")}
        {contributors ? ` from ${plural(contributors, "person", "people")}` : ""} so far. Search before you ask; if it isn&apos;t here,
        ask once and it stays.
      </p>

      <div className="mt-7">
        <HomeSearch placeholder="Chart string, scanner booking, which toolbox…">
          {open.length > 0 && (
            <Section
              title="Can you answer these?"
              more={
                <Link href={`/${slug}/open`} className={QUIET}>
                  All {open.length} <ArrowRight size={14} aria-hidden="true" />
                </Link>
              }
            >
              <ul className="space-y-2">
                {open.slice(0, 4).map((c) => (
                  <CardRow
                    key={c.id}
                    slug={slug}
                    card={c}
                    action={
                      <Link href={`/${slug}/c/${c.id}/edit`} className="rounded-lg px-2.5 py-1.5 text-sm text-accent hover:bg-accent/10">
                        I know this
                      </Link>
                    }
                  />
                ))}
              </ul>
            </Section>
          )}

          <Section title="Topics">
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
              {TOPICS.map((t) => (
                <li key={t.id}>
                  <Link href={`/${slug}/t/${t.id}`} className="tile tile-hover flex h-full gap-3 p-3.5">
                    <TopicIcon topic={t.id} size={18} className="mt-0.5 flex-shrink-0 text-accent" />
                    <span className="min-w-0">
                      <span className="flex items-baseline gap-2">
                        <span className="text-ink">{t.label}</span>
                        <span className="num text-xs text-faint">{perTopic.get(t.id) ?? 0}</span>
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-faint">{t.hint}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>

          {recent.length > 0 && (
            <Section title="Recently added or changed">
              <ul className="space-y-2">
                {recent.map((c) => (
                  <CardRow key={c.id} slug={slug} card={c} />
                ))}
              </ul>
            </Section>
          )}

          {stale.length > 0 && (
            <Section title="Worth a check">
              <p className="mb-3 text-sm text-muted">Nobody has said these are still right for over a year. If you know, open one and say so.</p>
              <ul className="space-y-2">
                {stale.map((c) => (
                  <CardRow key={c.id} slug={slug} card={c} />
                ))}
              </ul>
            </Section>
          )}
        </HomeSearch>
      </div>
    </div>
  );
}
