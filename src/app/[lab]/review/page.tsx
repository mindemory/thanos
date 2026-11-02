import { Inbox } from "lucide-react";
import Link from "next/link";

import { one } from "@/components/Frame";
import { ConfirmSubmit } from "@/components/client";
import { DraftCard, DraftUpload } from "@/components/lab/DraftCard";
import { QUIET } from "@/components/ui";
import { dropAllWaiting } from "@/lib/actions";
import { draftCounts, waitingDrafts } from "@/lib/drafts";
import { requireMember } from "@/lib/labs";

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
        <p className="lede mt-3">Drafts from the lab&apos;s chat wait here for the lab&apos;s admins to keep or drop.</p>
      </div>
    );
  }
  const page = Math.max(1, Math.floor(Number(one((await searchParams).page)) || 1));
  const [drafts, counts] = await Promise.all([waitingDrafts(lab.id, PER_PAGE, (page - 1) * PER_PAGE), draftCounts(lab.id)]);
  const pages = Math.max(1, Math.ceil(counts.waiting / PER_PAGE));

  return (
    <div className="screen-in">
      <h1 className="title-1">Review</h1>
      <p className="lede mt-3">
        Drafts made from {lab.name}&apos;s Slack. Keep the ones worth keeping, after fixing them if they need it, and drop the rest.
        Nothing here reaches the lab until an admin keeps it.
      </p>
      <p className="num mt-4 text-sm text-faint">
        {counts.waiting} waiting · {counts.kept} kept · {counts.dropped} dropped
      </p>

      <section className="card mt-6 p-5">
        <DraftUpload slug={slug} />
        <details className="mt-4 text-sm leading-relaxed text-muted">
          <summary className="cursor-pointer hover:text-ink">How to make drafts from the lab&apos;s Slack</summary>
          <div className="mt-3 space-y-2">
            <p>
              On a computer with the lab&apos;s Slack and <a href="https://ollama.com" className="text-accent underline underline-offset-2">Ollama</a>,
              in the Thanos folder, run:
            </p>
            <pre className="num overflow-x-auto rounded-xl bg-surface-2 p-3 text-xs text-ink">
              npm run import-slack -- --from &lt;folder&gt; --lab {slug}
            </pre>
            <p>
              The folder is an export from Slack (in its settings, under Import/export data, unzipped) or Proxenos&apos;s copy of the
              workspace. It reads public channels only. A model running on that computer turns each conversation worth keeping into a
              draft, so nothing leaves it. The drafts land in <code className="num">.thanos/imports/{slug}-drafts.jsonl</code>: add that
              file here.
            </p>
          </div>
        </details>
      </section>

      {drafts.length > 0 ? (
        <ul className="mt-8 space-y-4">
          {drafts.map((d) => (
            <DraftCard key={d.id} slug={slug} draft={d} />
          ))}
        </ul>
      ) : (
        <div className="card mt-8 flex flex-col items-center gap-3 p-10 text-center">
          <Inbox size={24} className="text-accent" aria-hidden="true" />
          <p className="title-2">Nothing waiting</p>
          <p className="max-w-sm text-muted">Drafts you add from a file show up here, one card each, for you to keep or drop.</p>
        </div>
      )}

      {(pages > 1 || counts.waiting > 0) && (
        <div className="mt-8 flex flex-wrap items-center gap-2 border-t border-line pt-5">
          {page > 1 && (
            <Link href={`/${slug}/review?page=${page - 1}`} className={QUIET}>
              Newer
            </Link>
          )}
          {pages > 1 && (
            <span className="num text-sm text-faint">
              Page {Math.min(page, pages)} of {pages}
            </span>
          )}
          {page < pages && (
            <Link href={`/${slug}/review?page=${page + 1}`} className={QUIET}>
              Older
            </Link>
          )}
          {counts.waiting > 0 && (
            <form action={dropAllWaiting.bind(null, slug)} className="ml-auto">
              <ConfirmSubmit question={`Drop all ${counts.waiting} drafts still waiting? They won't come back with the next file.`} className={QUIET}>
                Drop all still waiting
              </ConfirmSubmit>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
