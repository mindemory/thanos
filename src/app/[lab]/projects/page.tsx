import { ArrowRight, FolderKanban, Plus } from "lucide-react";
import Link from "next/link";

import { ProjectRow } from "@/components/lab/ProjectRow";
import { Note, PRIMARY, QUIET } from "@/components/ui";
import { projectDraftCounts } from "@/lib/drafts";
import { plural } from "@/lib/format";
import { requireMember } from "@/lib/labs";
import { labProjects, type Project } from "@/lib/projects";
import { finished } from "@/lib/timeline";

export const metadata = { title: "Projects" };

// Under way: active before paused, the latest started first. Finished: the latest to end first.
const ORDER = ["active", "paused", "published", "done"];
const latest = (a: number | null, b: number | null) => (b ?? 0) - (a ?? 0);
const going = (a: Project, b: Project) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || latest(a.started, b.started);
const ended = (a: Project, b: Project) => latest(a.ended, b.ended) || latest(a.started, b.started);

export default async function ProjectsPage({ params }: { params: Promise<{ lab: string }> }) {
  const { lab: slug } = await params;
  const { lab, isAdmin } = await requireMember(slug);
  const [projects, drafts] = await Promise.all([labProjects(lab.id), isAdmin ? projectDraftCounts(lab.id) : null]);
  const underway = projects.filter((p) => !finished(p.status)).sort(going);
  const done = projects.filter((p) => finished(p.status)).sort(ended);

  return (
    <div className="screen-in">
      <h1 className="title-1">Projects</h1>
      <p className="lede mt-3">
        What {lab.name} works on, and has worked on: who, where the code and data are, and what came of it. Anyone in the lab can start
        one or bring one up to date, and every version is kept.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Link href={`/${slug}/projects/new`} className={PRIMARY}>
          <Plus size={15} aria-hidden="true" /> Start a project
        </Link>
        <Link href={`/${slug}/history`} className={QUIET}>
          The lab over the years <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>

      {drafts && drafts.waiting > 0 && (
        <Note className="mt-6">
          Thanos found {plural(drafts.waiting, "likely project")} in the lab&apos;s GitHub and Slack, waiting for an admin to keep or drop.{" "}
          <Link href={`/${slug}/review?show=projects`} className="text-accent underline underline-offset-2">
            Review them
          </Link>
        </Note>
      )}

      {underway.length > 0 && (
        <section className="mt-10">
          <h2 className="smallcaps mb-3">Under way</h2>
          <ul className="space-y-2">
            {underway.map((p) => (
              <ProjectRow key={p.id} slug={slug} project={p} />
            ))}
          </ul>
        </section>
      )}
      {done.length > 0 && (
        <section className="mt-10">
          <h2 className="smallcaps mb-3">Finished</h2>
          <ul className="space-y-2">
            {done.map((p) => (
              <ProjectRow key={p.id} slug={slug} project={p} />
            ))}
          </ul>
        </section>
      )}

      {!projects.length && (
        <div className="card mt-8 flex flex-col items-center gap-3 p-10 text-center">
          <FolderKanban size={24} className="text-accent" aria-hidden="true" />
          <p className="title-2">No projects yet</p>
          <p className="max-w-sm text-muted">
            A project keeps its people, code, data, Slack channel and papers together, with the cards about it, for as long as the lab
            does.
            {isAdmin && " Thanos can also suggest them from the lab's GitHub and Slack, for you to keep or drop."}
          </p>
          {isAdmin && (
            <Link href={`/${slug}/review?show=projects`} className={`${QUIET} mt-1`}>
              Suggested projects <ArrowRight size={14} aria-hidden="true" />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
