import { FolderKanban, Inbox } from "lucide-react";
import Link from "next/link";

import { one } from "@/components/Frame";
import { CodeBlock, ConfirmSubmit, Value } from "@/components/client";
import { DraftCard, DraftUpload, ProjectDraftCard, SuggestFromGithub } from "@/components/lab/DraftCard";
import { QUIET } from "@/components/ui";
import { dropAllProjectDrafts, dropAllWaiting } from "@/lib/actions";
import { draftCounts, projectDraftCounts, waitingDrafts, waitingProjectDrafts } from "@/lib/drafts";
import { requireMember, type Lab } from "@/lib/labs";
import { draftValues, formChoices } from "@/lib/projects";
import { cn } from "@/lib/utils";

export const metadata = { title: "Review" };

const PER_PAGE = 10;

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ lab: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { lab: slug } = await params;
  const { lab, isAdmin } = await requireMember(slug);
  if (!isAdmin) {
    return (
      <div className="screen-in">
        <h1 className="title-1">Review</h1>
        <p className="lede mt-3">
          Drafts from the lab&apos;s Slack and GitHub, cards and projects, wait here for the lab&apos;s admins to keep or drop.
        </p>
      </div>
    );
  }
  const query = await searchParams;
  const projects = one(query.show) === "projects";
  const page = Math.max(1, Math.floor(Number(one(query.page)) || 1));
  const [cardCounts, projectCounts] = await Promise.all([draftCounts(lab.id), projectDraftCounts(lab.id)]);
  const counts = projects ? projectCounts : cardCounts;
  const pages = Math.max(1, Math.ceil(counts.waiting / PER_PAGE));
  const here = (n: number) => `/${slug}/review?${projects ? "show=projects&" : ""}page=${n}`;

  // Two pressed links, one for each kind of draft, like the card form's two buttons.
  const kinds = [
    { label: "Cards", href: `/${slug}/review`, on: !projects, waiting: cardCounts.waiting },
    { label: "Projects", href: `/${slug}/review?show=projects`, on: projects, waiting: projectCounts.waiting },
  ];

  return (
    <div className="screen-in">
      <h1 className="title-1">Review</h1>
      <p className="lede mt-3">
        {projects
          ? `Projects Thanos found in ${lab.name}'s GitHub and Slack. Keep the real ones, after fixing them if they need it, and drop the rest. Nothing here reaches the lab until an admin keeps it.`
          : `Drafts made from ${lab.name}'s Slack. Keep the ones worth keeping, after fixing them if they need it, and drop the rest. Nothing here reaches the lab until an admin keeps it.`}
      </p>

      <nav aria-label="Kinds of draft" className="mt-6 inline-flex rounded-xl border border-line-strong bg-surface p-1 text-sm">
        {kinds.map((k) => (
          <Link
            key={k.label}
            href={k.href}
            aria-current={k.on ? "page" : undefined}
            className={cn("rounded-lg px-3 py-1.5 transition-colors", k.on ? "bg-surface-3 text-ink" : "text-muted hover:text-ink")}
          >
            {k.label} <span className="num text-faint">{k.waiting}</span>
          </Link>
        ))}
      </nav>
      <p className="num mt-4 text-sm text-faint">
        {counts.waiting} waiting · {counts.kept} kept · {counts.dropped} dropped
      </p>

      <section className="card mt-6 space-y-4 p-5">
        {projects && <SuggestFromGithub slug={slug} />}
        <DraftUpload slug={slug} />
        <details className="text-sm leading-relaxed text-muted">
          <summary className="cursor-pointer hover:text-ink">
            {projects ? "How to find projects in the lab's Slack" : "How to make drafts from the lab's Slack"}
          </summary>
          <div className="mt-3 space-y-2">
            <p>
              On a computer with the lab&apos;s Slack and <a href="https://ollama.com" className="text-accent underline underline-offset-2">Ollama</a>,
              in the Thanos folder, run:
            </p>
            <CodeBlock code={`npm run import-slack -- --from <folder> --lab ${slug}${projects ? " --projects" : ""}`} lang="bash" />
            {projects ? (
              <p>
                The folder is an export from Slack, unzipped, or Proxenos&apos;s copy of the workspace. It reads public channels only. A model
                running on that computer says which channels are clearly a project&apos;s and what each project is; its years, people and
                links come from the channel itself. The drafts land in <Value text={`.thanos/imports/${slug}-projects.jsonl`} />: add that
                file here. A project found in both comes with its code: a repository with the same name as its channel joins it.
              </p>
            ) : (
              <p>
                The folder is an export from Slack (in its settings, under Import/export data, unzipped) or Proxenos&apos;s copy of the
                workspace. It reads public channels only. A model running on that computer turns each conversation worth keeping into a
                draft, so nothing leaves it. The drafts land in <Value text={`.thanos/imports/${slug}-drafts.jsonl`} />: add that file here.
              </p>
            )}
          </div>
        </details>
      </section>

      {projects ? <ProjectDrafts slug={slug} lab={lab} page={page} /> : <CardDrafts labId={lab.id} slug={slug} page={page} />}

      {(pages > 1 || counts.waiting > 0) && (
        <div className="mt-8 flex flex-wrap items-center gap-2 border-t border-line pt-5">
          {page > 1 && (
            <Link href={here(page - 1)} className={QUIET}>
              {projects ? "Back" : "Newer"}
            </Link>
          )}
          {pages > 1 && (
            <span className="num text-sm text-faint">
              Page {Math.min(page, pages)} of {pages}
            </span>
          )}
          {page < pages && (
            <Link href={here(page + 1)} className={QUIET}>
              {projects ? "More" : "Older"}
            </Link>
          )}
          {counts.waiting > 0 && (
            <form action={(projects ? dropAllProjectDrafts : dropAllWaiting).bind(null, slug)} className="ml-auto">
              <ConfirmSubmit
                question={`Drop all ${counts.waiting} ${projects ? "projects" : "drafts"} still waiting? They won't come back with the next file.`}
                className={QUIET}
              >
                Drop all still waiting
              </ConfirmSubmit>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

async function CardDrafts({ labId, slug, page }: { labId: string; slug: string; page: number }) {
  const drafts = await waitingDrafts(labId, PER_PAGE, (page - 1) * PER_PAGE);
  if (!drafts.length) {
    return (
      <div className="card mt-8 flex flex-col items-center gap-3 p-10 text-center">
        <Inbox size={24} className="text-accent" aria-hidden="true" />
        <p className="title-2">Nothing waiting</p>
        <p className="max-w-sm text-muted">Drafts you add from a file show up here, one card each, for you to keep or drop.</p>
      </div>
    );
  }
  return (
    <ul className="mt-8 space-y-4">
      {drafts.map((d) => (
        <DraftCard key={d.id} slug={slug} draft={d} />
      ))}
    </ul>
  );
}

async function ProjectDrafts({ slug, lab, page }: { slug: string; lab: Lab; page: number }) {
  const [drafts, choices] = await Promise.all([waitingProjectDrafts(lab.id, PER_PAGE, (page - 1) * PER_PAGE), formChoices(lab)]);
  if (!drafts.length) {
    return (
      <div className="card mt-8 flex flex-col items-center gap-3 p-10 text-center">
        <FolderKanban size={24} className="text-accent" aria-hidden="true" />
        <p className="title-2">Nothing waiting</p>
        <p className="max-w-sm text-muted">
          Projects Thanos finds in the lab&apos;s GitHub, or in a file from its Slack, show up here, one each, for you to keep or drop.
        </p>
      </div>
    );
  }
  return (
    <ul className="mt-8 space-y-4">
      {drafts.map((d) => (
        <ProjectDraftCard key={d.id} slug={slug} draft={d} values={draftValues(d, choices)} people={choices.people} repos={choices.repos} />
      ))}
    </ul>
  );
}
