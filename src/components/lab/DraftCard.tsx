"use client";

import { ChevronDown, FolderGit2, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { useFormAction } from "@/components/client";
import { Marked, useSearchIndex } from "@/components/lab/LabProvider";
import { ProjectFields, SecretNote } from "@/components/lab/ProjectForm";
import { BUTTON, INPUT, Note, PRIMARY, QUIET } from "@/components/ui";
import { dropDraft, dropProjectDraft, keepDraft, keepProjectDraft, suggestFromGithub, uploadDrafts, type FormState } from "@/lib/actions";
import type { Draft, ProjectDraft } from "@/lib/drafts";
import type { PersonOption, ProjectValues } from "@/lib/projects";
import { monthYear, plural } from "@/lib/format";
import { search } from "@/lib/search";
import { TOPICS } from "@/lib/topics";
import { cn } from "@/lib/utils";

/**
 * One draft, editable in place. Keep makes it a card as it stands; Drop sets it aside. It also
 * says if the lab may already have a card like it, so the same answer isn't kept twice.
 */
export function DraftCard({ slug, draft }: { slug: string; draft: Draft }) {
  const index = useSearchIndex();
  const [state, formProps, pending] = useFormAction<FormState>(keepDraft, {});
  const [dropping, startDrop] = useTransition();
  const twin = useMemo(() => search(index, draft.question, 1).find((h) => h.doc.kind === "card" && !h.doc.open), [index, draft.question]);

  return (
    <li className="card p-4 md:p-5">
      <p className="text-xs text-faint">From {draft.source || "the lab's chat"}</p>
      <form {...formProps} className="mt-3 space-y-3">
        <input type="hidden" name="lab" value={slug} />
        <input type="hidden" name="id" value={draft.id} />
        <label className="block">
          <span className="sr-only">Question</span>
          <input name="question" defaultValue={draft.question} required minLength={8} maxLength={300} className={cn(INPUT, "font-display text-[1.0625rem]")} />
        </label>
        <label className="block">
          <span className="sr-only">Answer</span>
          <textarea name="answer" defaultValue={draft.answer} required rows={6} className={cn(INPUT, "text-sm leading-relaxed")} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="sr-only">Topic</span>
            <select name="topic" defaultValue={draft.topic} className={cn(INPUT, "py-2 text-sm")}>
              {TOPICS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="sr-only">Other words for it</span>
            <input name="tags" defaultValue={draft.tags} maxLength={300} placeholder="Other words for it" className={cn(INPUT, "py-2 text-sm")} />
          </label>
        </div>

        {twin && (
          <p className="text-sm text-warn-ink">
            The lab may already have this:{" "}
            <Link href={twin.doc.href} target="_blank" className="underline underline-offset-2">
              <Marked text={twin.doc.title} terms={twin.terms} />
            </Link>
          </p>
        )}

        {draft.thread && (
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm text-muted hover:text-ink">
              <ChevronDown size={14} className="transition-transform group-open:rotate-180" aria-hidden="true" />
              The conversation it came from
            </summary>
            <pre className="tile mt-2 max-h-72 overflow-auto whitespace-pre-wrap p-3 font-sans text-sm leading-relaxed text-muted">
              {draft.thread}
            </pre>
          </details>
        )}

        {state.error && <Note tone="bad">{state.error}</Note>}
        {state.sensitive && (
          <Note tone="warn">
            This looks like it has {state.sensitive.join(" and ")} in it. Take it out before keeping it, or keep it anyway.
            <button type="submit" name="confirm" value="yes" disabled={pending} className={cn(BUTTON, "mt-3")}>
              Keep anyway
            </button>
          </Note>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button type="submit" disabled={pending || dropping} className={PRIMARY}>
            {pending ? "Keeping…" : "Keep"}
          </button>
          <button
            type="button"
            disabled={pending || dropping}
            onClick={() => startDrop(() => dropDraft(slug, draft.id))}
            className={QUIET}
          >
            {dropping ? "Dropping…" : "Drop"}
          </button>
          {draft.dated && <span className="ml-auto text-xs text-faint">Said {monthYear(draft.dated)}</span>}
        </div>
      </form>
    </li>
  );
}

/**
 * One project draft, editable in place, with what it came from: a Slack channel, as the importer
 * read it, or a repository. Keep makes it a project as it stands; Drop sets it aside.
 */
export function ProjectDraftCard({
  slug,
  draft,
  values,
  people,
  repos,
}: {
  slug: string;
  draft: ProjectDraft;
  values: ProjectValues;
  people: PersonOption[];
  repos: string[];
}) {
  const [state, formProps, pending] = useFormAction<FormState>(keepProjectDraft, {});
  const [dropping, startDrop] = useTransition();
  return (
    <li className="card p-4 md:p-5">
      <p className="text-xs text-faint">From {draft.source || "the lab's chat"}</p>
      <form {...formProps} className="mt-4 space-y-5">
        <input type="hidden" name="lab" value={slug} />
        <input type="hidden" name="id" value={draft.id} />
        <ProjectFields values={values} people={people} repos={repos} />

        {draft.evidence && (
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm text-muted hover:text-ink">
              <ChevronDown size={14} className="transition-transform group-open:rotate-180" aria-hidden="true" />
              What Thanos read in the channel
            </summary>
            <pre className="tile mt-2 max-h-72 overflow-auto whitespace-pre-wrap p-3 font-sans text-sm leading-relaxed text-muted">
              {draft.evidence}
            </pre>
          </details>
        )}

        {state.error && <Note tone="bad">{state.error}</Note>}
        {state.sensitive && <SecretNote kinds={state.sensitive} pending={pending} label="Keep anyway" />}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button type="submit" disabled={pending || dropping} className={PRIMARY}>
            {pending ? "Keeping…" : "Keep"}
          </button>
          <button
            type="button"
            disabled={pending || dropping}
            onClick={() => startDrop(() => dropProjectDraft(slug, draft.id))}
            className={QUIET}
          >
            {dropping ? "Dropping…" : "Drop"}
          </button>
          <span className="ml-auto text-xs text-faint">Not a project, or one the lab has? Drop it.</span>
        </div>
      </form>
    </li>
  );
}

/** Drafts a project for each of the lab's repositories on GitHub that no project has yet. */
export function SuggestFromGithub({ slug }: { slug: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<{ text: string; bad?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const suggest = () =>
    start(async () => {
      const reply = await suggestFromGithub(slug);
      if ("error" in reply) {
        setStatus({ text: reply.error, bad: true });
        return;
      }
      const parts = [];
      if (reply.added) parts.push(`${plural(reply.added, "new draft")}`);
      if (reply.joined) parts.push(`${plural(reply.joined, "repository", "repositories")} added to drafts from Slack`);
      setStatus({ text: parts.length ? `${parts.join(", and ")}.` : "Every repository the lab has on GitHub already has a project or a draft." });
      router.refresh();
    });
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={suggest} disabled={pending} className={BUTTON}>
        <FolderGit2 size={15} aria-hidden="true" />
        {pending ? "Looking…" : "Suggest projects from GitHub"}
      </button>
      {status && (
        <span role="status" className={cn("text-sm", status.bad ? "text-bad-ink" : "text-muted")}>
          {status.text}
        </span>
      )}
    </div>
  );
}

// A request carries at most about this many characters of drafts, well under the size limits of
// server actions here and on a host like Vercel.
const PIECE = 400_000;

/** Adds an import file's drafts, a piece at a time, and says how it went. */
export function DraftUpload({ slug }: { slug: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<{ text: string; bad?: boolean } | null>(null);
  const [pending, start] = useTransition();

  const add = (input: HTMLInputElement) => {
    const file = input.files?.[0];
    if (!file) return;
    start(async () => {
      const lines = (await file.text()).split("\n").filter((l) => l.trim());
      const tally = { added: 0, already: 0, rejected: 0 };
      let piece: string[] = [];
      let size = 0;
      const send = async () => {
        if (!piece.length) return true;
        const reply = await uploadDrafts(slug, piece);
        piece = [];
        size = 0;
        if ("error" in reply) {
          setStatus({ text: reply.error, bad: true });
          return false;
        }
        tally.added += reply.added;
        tally.already += reply.already;
        tally.rejected += reply.rejected;
        setStatus({ text: `Adding drafts: ${tally.added + tally.already + tally.rejected} of ${lines.length}…` });
        return true;
      };
      for (const line of lines) {
        if (size + line.length > PIECE && !(await send())) return;
        piece.push(line);
        size += line.length;
      }
      if (!(await send())) return;
      const parts = [`${tally.added} added`];
      if (tally.already) parts.push(`${tally.already} already here`);
      if (tally.rejected) parts.push(`${tally.rejected} left out (unreadable, or with something like a password in it)`);
      setStatus({ text: `${parts.join(", ")}.` });
      input.value = "";
      router.refresh(); // the new drafts, and the count beside Review
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className={cn(BUTTON, "cursor-pointer", pending && "pointer-events-none opacity-50")}>
        <Upload size={15} aria-hidden="true" />
        {pending ? "Adding…" : "Add drafts from a file"}
        <input
          type="file"
          accept=".jsonl,application/jsonl,application/x-ndjson,text/plain"
          className="sr-only"
          disabled={pending}
          onChange={(e) => add(e.currentTarget)}
        />
      </label>
      {status && <span className={cn("text-sm", status.bad ? "text-bad-ink" : "text-muted")}>{status.text}</span>}
    </div>
  );
}
