import { ArrowRight, GitFork, Star } from "lucide-react";
import Link from "next/link";

import { Note, QUIET } from "@/components/ui";
import { ago } from "@/lib/format";
import { labRepos } from "@/lib/github";
import { requireMember } from "@/lib/labs";

export const metadata = { title: "Code" };

export default async function CodePage({ params }: { params: Promise<{ lab: string }> }) {
  const { lab: slug } = await params;
  const { lab, isAdmin } = await requireMember(slug);
  const { repos, problems } = await labRepos(lab.github);

  return (
    <div className="screen-in">
      <h1 className="title-1">Code</h1>
      <p className="lede mt-3">
        What {lab.name} has put on GitHub, most recently changed first: what people built, and the toolboxes the lab forked. Search
        finds these too.
      </p>
      {!lab.github && (
        <Note className="mt-6">
          No GitHub organization is set for this lab yet.{" "}
          {isAdmin ? (
            <Link href={`/${slug}/settings`} className="text-accent underline underline-offset-2">
              Add it in Settings
            </Link>
          ) : (
            "An admin can add it in Settings."
          )}
        </Note>
      )}
      {problems.map((p) => (
        <Note key={p} tone="warn" className="mt-6">
          {p}
        </Note>
      ))}
      {repos.length > 0 && (
        <ul className="mt-8 space-y-2">
          {repos.map((r) => (
            <li key={`${r.owner}/${r.name}`} className="tile tile-hover relative p-3.5">
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="after:absolute after:inset-0 after:content-['']">
                <span className="text-faint">{r.owner}/</span>
                <span className="title-3">{r.name}</span>
              </a>
              {r.description && <p className="mt-1 text-sm leading-relaxed text-muted">{r.description}</p>}
              <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint">
                {r.language && <span>{r.language}</span>}
                <span>Changed {ago(r.pushedAt)}</span>
                {r.stars > 0 && (
                  <span className="num inline-flex items-center gap-1">
                    <Star size={12} aria-hidden="true" /> {r.stars}
                  </span>
                )}
                {r.fork && (
                  <span className="inline-flex items-center gap-1">
                    <GitFork size={12} aria-hidden="true" /> fork
                  </span>
                )}
                {r.private && <span className="text-warn-ink">private</span>}
                {r.archived && <span>archived</span>}
              </p>
            </li>
          ))}
        </ul>
      )}
      <Link href={`/${slug}/t/code`} className={`${QUIET} mt-8`}>
        What the lab knows about code and data <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </div>
  );
}
