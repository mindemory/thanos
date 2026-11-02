import { notFound } from "next/navigation";

import { CardForm } from "@/components/lab/CardForm";
import { cardDetail } from "@/lib/cards";
import { requireMember } from "@/lib/labs";

export const metadata = { title: "Edit" };

export default async function EditCardPage({ params }: { params: Promise<{ lab: string; id: string }> }) {
  const { lab: slug, id } = await params;
  const { lab, person } = await requireMember(slug);
  const card = await cardDetail(lab.id, id, person.id);
  if (!card) notFound();
  return (
    <div className="screen-in">
      <h1 className="title-1">{card.open ? "Answer this" : "Edit"}</h1>
      <p className="lede mt-3">
        {card.open
          ? "Write what you know, even if it's only part of it, and who to ask for the rest."
          : "Anyone in the lab can improve an answer. The version before stays in its history."}
      </p>
      <div className="mt-8">
        <CardForm
          card={{ id: card.id, question: card.question, answer: card.answer, topic: card.topic, tags: card.tags, open: card.open }}
        />
      </div>
    </div>
  );
}
