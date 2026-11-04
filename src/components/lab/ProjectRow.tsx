import { FolderKanban } from "lucide-react";
import Link from "next/link";

import { plural } from "@/lib/format";
import type { Project } from "@/lib/projects";
import { plain } from "@/lib/search";
import { span, statusLabel } from "@/lib/timeline";
import { cn } from "@/lib/utils";

// How a project stands, in the colours that mean the same everywhere else: violet while it runs,
// amber while it waits, and green once something came of it.
const TONES: Record<string, string> = {
  active: "border-accent/40 text-accent",
  paused: "border-warn-line text-warn-ink",
  done: "border-line-strong text-muted",
  published: "border-ok-line text-ok-ink",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span className={cn("whitespace-nowrap rounded-full border px-2 text-xs leading-5", TONES[status] ?? TONES.active, className)}>
      {statusLabel(status)}
    </span>
  );
}

/** Everyone on a project, in a line: the lab's people, then anyone named who isn't in Thanos. */
export function peopleLine(project: Pick<Project, "people" | "others">, most = 4): string {
  const names = [...project.people.map((p) => p.name), ...project.others];
  return names.length > most ? `${names.slice(0, most).join(", ")} and ${names.length - most} more` : names.join(", ");
}

/** A project in a list: its name and how it stands, what it is, its years and who is on it. */
export function ProjectRow({ slug, project }: { slug: string; project: Project }) {
  const years = span(project.started, project.ended, project.status);
  const people = peopleLine(project);
  return (
    <li className="tile tile-hover relative flex gap-3 p-3.5">
      <FolderKanban size={16} className="mt-1 flex-shrink-0 text-muted" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <Link href={`/${slug}/p/${project.slug}`} className="stretched title-3">
            {project.name}
          </Link>
          <StatusBadge status={project.status} />
        </div>
        {project.summary && <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted">{plain(project.summary)}</p>}
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint tabular-nums">
          {years && <span>{years}</span>}
          {people && <span>{people}</span>}
          {project.cards > 0 && <span className="num">{plural(project.cards, "card")}</span>}
          {project.papers.length > 0 && <span className="num">{plural(project.papers.length, "paper")}</span>}
        </p>
      </div>
    </li>
  );
}
