import Link from "next/link";

import { TopicIcon } from "@/components/TopicIcon";
import { mayBeStale, type CardSummary } from "@/lib/cards";
import { ago } from "@/lib/format";
import { plain } from "@/lib/search";
import { topicOf } from "@/lib/topics";

/** A card in a list: its question, the start of its answer, and how it stands, and its project unless the list is that project's. */
export function CardRow({
  slug,
  card,
  action,
  showProject = true,
}: {
  slug: string;
  card: CardSummary;
  action?: React.ReactNode;
  showProject?: boolean;
}) {
  const stale = mayBeStale(card);
  return (
    <li className="tile tile-hover relative flex gap-3 p-3.5">
      <TopicIcon topic={card.topic} className="mt-1 flex-shrink-0 text-muted" />
      <div className="min-w-0 flex-1">
        <Link href={`/${slug}/c/${card.id}`} className="stretched title-3 block">
          {card.question}
        </Link>
        {card.answer && <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted">{plain(card.answer)}</p>}
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint tabular-nums">
          <span>{topicOf(card.topic).label}</span>
          {showProject && card.project && <span>{card.project.name}</span>}
          {card.open ? (
            <span className="text-warn-ink">
              Asked {ago(card.createdAt)}
              {card.askedBy ? ` by ${card.askedBy}` : ""}
            </span>
          ) : (
            <span>Updated {ago(card.updatedAt)}</span>
          )}
          {card.open && card.wanted > 0 && <span className="num">{card.wanted} need this</span>}
          {card.helped > 0 && <span className="num">Helped {card.helped}</span>}
          {stale && <span className="text-warn-ink">May be out of date</span>}
        </p>
      </div>
      {action && <div className="relative z-10 flex-shrink-0 self-center">{action}</div>}
    </li>
  );
}
