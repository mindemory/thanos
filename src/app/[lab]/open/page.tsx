import { MessageCircleQuestionMark } from "lucide-react";
import Link from "next/link";

import { CardRow } from "@/components/lab/CardRow";
import { PRIMARY } from "@/components/ui";
import { labCards } from "@/lib/cards";
import { requireMember } from "@/lib/labs";

export const metadata = { title: "Open questions" };

export default async function OpenPage({ params }: { params: Promise<{ lab: string }> }) {
  const { lab: slug } = await params;
  const { lab } = await requireMember(slug);
  const open = (await labCards(lab.id))
    .filter((c) => c.open)
    .sort((a, b) => b.wanted - a.wanted || a.createdAt.localeCompare(b.createdAt));

  return (
    <div className="screen-in">
      <h1 className="title-1">Open questions</h1>
      <p className="lede mt-3">
        What people in {lab.name} have asked and nobody has answered yet, the most wanted first. Know one? Answer it, and it&apos;s
        answered for everyone after you.
      </p>
      {open.length ? (
        <ul className="mt-8 space-y-2">
          {open.map((c) => (
            <CardRow
              key={c.id}
              slug={slug}
              card={c}
              action={
                <Link href={`/${slug}/c/${c.id}/edit`} className="rounded-lg px-2.5 py-1.5 text-sm text-accent hover:bg-accent/10">
                  Answer
                </Link>
              }
            />
          ))}
        </ul>
      ) : (
        <div className="card mt-8 flex flex-col items-center gap-3 p-10 text-center">
          <MessageCircleQuestionMark size={24} className="text-accent" aria-hidden="true" />
          <p className="title-2">Nothing is waiting</p>
          <p className="max-w-sm text-muted">Every question asked here has an answer. Ask the next one when it comes up.</p>
          <Link href={`/${slug}/ask`} className={`${PRIMARY} mt-2`}>
            Ask a question
          </Link>
        </div>
      )}
    </div>
  );
}
