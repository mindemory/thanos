import { ChevronDown, FolderKanban, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ConfirmSubmit, CopyIcon, Value } from "@/components/client";
import { CardRow } from "@/components/lab/CardRow";
import { StatusBadge } from "@/components/lab/ProjectRow";
import { Markdown } from "@/components/Markdown";
import { BUTTON, QUIET } from "@/components/ui";
import { removeProjectAction } from "@/lib/actions";
import { labCards } from "@/lib/cards";
import { ago, monthYear, plural } from "@/lib/format";
import { labRepos } from "@/lib/github";
import { requireMember } from "@/lib/labs";
import { projectBySlug, projectVersions, type ProjectVersion, type Snapshot } from "@/lib/projects";
import { span, statusLabel } from "@/lib/timeline";

/** One line of what a project has: what, then the things themselves. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5 border-t border-line py-3.5 first:border-t-0 first:pt-0 last:pb-0 sm:grid-cols-[8.5rem_1fr] sm:gap-4">
      <dt className="smallcaps pt-1">{label}</dt>
      <dd className="min-w-0 space-y-1.5">{children}</dd>
    </div>
  );
}

const isLink = (text: string) => /^https?:\/\//i.test(text);

/** What a version changed, judged against the one before it. */
function changes(v: Snapshot, before: Snapshot | undefined): string {
  if (!before) return "";
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const parts: string[] = [];
  if (v.name !== before.name) parts.push("renamed");
  if (v.status !== before.status) parts.push(`${statusLabel(before.status)} to ${statusLabel(v.status)}`);
  if (v.started !== before.started || v.ended !== before.ended) parts.push("its years");
  if (v.summary !== before.summary) parts.push("what it is");
  if (!same(v.people, before.people) || !same(v.others, before.others)) parts.push("people");
  if (!same(v.repos, before.repos)) parts.push("code");
  if (!same(v.data, before.data)) parts.push("data");
  if (v.slack !== before.slack) parts.push("Slack");
  if (!same(v.papers, before.papers)) parts.push("papers");
  return parts.join(", ");
}

// The newest versions; every one of them is in the lab's JSON download.
const VERSIONS_SHOWN = 20;

function Versions({ versions, source }: { versions: ProjectVersion[]; source: string }) {
  if (versions.length < 2) return null;
  return (
    <details className="group mt-10">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm text-muted hover:text-ink">
        <ChevronDown size={15} className="transition-transform group-open:rotate-180" aria-hidden="true" />
        History · {versions.length} versions
      </summary>
      <ol className="mt-4 space-y-2 border-l border-line pl-4">
        {versions.slice(0, VERSIONS_SHOWN).map((v, i) => {
          const before = versions[i + 1];
          const what = before ? changes(v.snapshot, before.snapshot) : "";
          return (
            <li key={v.id} className="text-sm">
              <span className="text-ink">{before ? "Changed" : source ? "Kept" : "Started"}</span>
              <span className="text-muted tabular-nums">
                {" "}
                by {v.editedBy ?? "someone"} · {monthYear(v.editedAt)}
              </span>
              {what && <span className="text-muted"> · {what}</span>}
              {v.note && <span className="text-faint"> · {v.note}</span>}
            </li>
          );
        })}
      </ol>
      {versions.length > VERSIONS_SHOWN && (
        <p className="mt-3 pl-4 text-sm text-faint">
          And {versions.length - VERSIONS_SHOWN} earlier versions, all in the lab&apos;s JSON download (Settings, then Keep a copy).
        </p>
      )}
    </details>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ lab: string; slug: string }> }) {
  const { lab: slug, slug: address } = await params;
  const { lab } = await requireMember(slug);
  return { title: (await projectBySlug(lab.id, address))?.name ?? "Not found" };
}

export default async function ProjectPage({ params }: { params: Promise<{ lab: string; slug: string }> }) {
  const { lab: slug, slug: address } = await params;
  const { lab, person, isAdmin } = await requireMember(slug);
  const project = await projectBySlug(lab.id, address);
  if (!project) notFound();
  const [cards, versions, { repos }] = await Promise.all([labCards(lab.id), projectVersions(project.id), labRepos(lab.github)]);
  const about = cards.filter((c) => c.project?.id === project.id);
  const years = span(project.started, project.ended, project.status);
  const canRemove = isAdmin || project.createdById === person.id;
  const first = versions[versions.length - 1];
  const hasFacts = project.people.length + project.others.length + project.repos.length + project.data.length + project.papers.length > 0 || project.slack;

  return (
    <article className="screen-in">
      <Link href={`/${slug}/projects`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <FolderKanban size={14} aria-hidden="true" /> Projects
      </Link>
      <h1 className="title-1 mt-3">{project.name}</h1>
      <p className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-muted tabular-nums">
        <StatusBadge status={project.status} />
        {years && <span>{years}</span>}
      </p>

      <div className="card mt-6 p-5 md:p-6">
        {project.summary ? (
          <Markdown source={project.summary} />
        ) : (
          <p className="text-muted">
            Nobody has said what it is yet.{" "}
            <Link href={`/${slug}/p/${project.slug}/edit`} className="text-accent underline underline-offset-2">
              Say what it is
            </Link>
          </p>
        )}
      </div>

      {hasFacts && (
        <dl className="card mt-4 p-5 md:p-6">
          {project.people.length + project.others.length > 0 && (
            <Fact label="People">
              <p className="leading-relaxed">
                {project.people.map((p, i) => (
                  <span key={p.id}>
                    {i > 0 && ", "}
                    {p.role ? (
                      <Link href={`/${slug}/people#person-${p.id}`} className="text-ink hover:text-accent">
                        {p.name}
                      </Link>
                    ) : (
                      <span className="text-ink">{p.name}</span>
                    )}
                    {p.role === "alum" && <span className="text-faint"> (alum)</span>}
                  </span>
                ))}
                {project.others.length > 0 && (
                  <span className="text-muted">
                    {project.people.length > 0 && ", and "}
                    {project.others.join(", ")}
                    <span className="text-faint">, not in Thanos</span>
                  </span>
                )}
              </p>
            </Fact>
          )}
          {project.repos.length > 0 && (
            <Fact label="Code">
              {project.repos.map((full) => {
                const [owner, name] = full.split("/");
                const known = repos.find((r) => `${r.owner}/${r.name}`.toLowerCase() === full.toLowerCase());
                return (
                  <div key={full}>
                    <p className="flex items-center gap-1">
                      {/* A repository's name is an ID people type and paste, so it's set in mono. */}
                      <a href={`https://github.com/${full}`} target="_blank" rel="noopener noreferrer" className="code hover:text-accent">
                        <span className="text-faint">{owner}/</span>
                        <span className="text-ink">{name}</span>
                      </a>
                      <CopyIcon text={`https://github.com/${full}`} label={`Copy the address of ${full}, to clone it`} />
                    </p>
                    {known?.description && <p className="text-sm leading-relaxed text-muted">{known.description}</p>}
                  </div>
                );
              })}
            </Fact>
          )}
          {project.data.length > 0 && (
            <Fact label="Data">
              {project.data.map((place) => (
                <p key={place} className="leading-relaxed">
                  {isLink(place) ? (
                    <>
                      <a href={place} target="_blank" rel="noopener noreferrer" className="code break-all text-sm text-accent underline underline-offset-2">
                        {place}
                      </a>
                      <CopyIcon text={place} label="Copy the link" className="ml-0.5" />
                    </>
                  ) : (
                    <Value text={place} />
                  )}
                </p>
              ))}
            </Fact>
          )}
          {project.slack && (
            <Fact label="Slack">
              <p>
                {isLink(project.slack) ? (
                  <a href={project.slack} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2">
                    Its channel
                  </a>
                ) : (
                  <Value text={project.slack} />
                )}
              </p>
            </Fact>
          )}
          {project.papers.length > 0 && (
            <Fact label="Papers">
              {project.papers.map((paper) => (
                <div key={paper.doi}>
                  <a
                    href={`https://doi.org/${paper.doi}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={paper.title ? "leading-snug text-ink hover:text-accent" : "code text-sm text-ink hover:text-accent"}
                  >
                    {paper.title || paper.doi}
                  </a>
                  <p className="text-sm text-muted tabular-nums">
                    {paper.title
                      ? [paper.detail, paper.year].filter(Boolean).join(", ")
                      : "doi.org didn't answer when this was saved. Saving the project again asks again."}
                  </p>
                </div>
              ))}
            </Fact>
          )}
        </dl>
      )}

      <p className="mt-3 text-sm text-muted tabular-nums first-letter:uppercase">
        {[
          project.source ? `From ${project.source}` : null,
          first ? `${project.source ? "kept" : "started"} by ${first.editedBy ?? "someone"}, ${ago(first.editedAt)}` : null,
          versions.length > 1 && versions[0].editedBy ? `last changed by ${versions[0].editedBy}, ${ago(versions[0].editedAt)}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-5">
        <Link href={`/${slug}/p/${project.slug}/edit`} className={BUTTON}>
          <Pencil size={15} aria-hidden="true" /> Edit
        </Link>
        {canRemove && (
          <form action={removeProjectAction.bind(null, slug, project.id)} className="ml-auto">
            <ConfirmSubmit
              question="Remove this project? It leaves the lists, search and History, and its cards stay where they are. Its history stays in the database."
              className={QUIET}
            >
              Remove
            </ConfirmSubmit>
          </form>
        )}
      </div>

      <section className="mt-12">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="smallcaps">What the lab knows about it</h2>
          {about.length > 0 && <span className="num text-xs text-faint">{plural(about.length, "card")}</span>}
        </div>
        {about.length > 0 ? (
          <ul className="space-y-2">
            {about.map((c) => (
              <CardRow key={c.id} slug={slug} card={c} showProject={false} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">
            Nothing yet. How to run it, where things are, what everyone new to it asks: a card for each, so the next person starts from
            there.
          </p>
        )}
        <Link href={`/${slug}/ask?mode=write&project=${encodeURIComponent(project.slug)}`} className={`${QUIET} mt-3`}>
          <Plus size={15} aria-hidden="true" /> Add a card about it
        </Link>
      </section>

      <Versions versions={versions} source={project.source} />
    </article>
  );
}
