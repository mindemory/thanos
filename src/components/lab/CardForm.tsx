"use client";

import { BookOpen, MessageCircleQuestionMark } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";

import { useFormAction } from "@/components/client";
import { Marked, useLab, useSearchIndex } from "@/components/lab/LabProvider";
import { BUTTON, Field, INPUT, Note, PRIMARY, QUIET } from "@/components/ui";
import { saveCard, type FormState } from "@/lib/actions";
import { search, type Hit } from "@/lib/search";
import { TOPICS } from "@/lib/topics";
import { cn } from "@/lib/utils";

export interface CardDraft {
  id: string;
  question: string;
  answer: string;
  topic: string;
  tags: string;
  open: boolean;
}

function joinKinds(kinds: string[]): string {
  return kinds.length < 2 ? kinds.join("") : `${kinds.slice(0, -1).join(", ")} and ${kinds[kinds.length - 1]}`;
}

/** As someone types a question, the cards that may already answer it, so it isn't asked twice. */
function AlreadyHere({ hits }: { hits: Hit[] }) {
  return (
    <div className="card card-quiet fade-in p-3.5">
      <p className="smallcaps px-2">Already in Thanos?</p>
      <ul className="mt-1.5 space-y-0.5">
        {hits.map((h) => (
          <li key={h.doc.id}>
            <Link href={h.doc.href} className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-2">
              {h.doc.open ? (
                <MessageCircleQuestionMark size={15} className="mt-1 flex-shrink-0 text-warn-ink" aria-hidden="true" />
              ) : (
                <BookOpen size={15} className="mt-1 flex-shrink-0 text-muted" aria-hidden="true" />
              )}
              <span className="min-w-0 flex-1 text-sm leading-relaxed">
                <Marked text={h.doc.title} terms={h.terms} />
                {h.doc.open && <span className="ml-2 text-xs text-warn-ink">asked, not answered yet</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Asking, sharing what you know, answering and editing are one form. Asked, a card goes on the
 * Open list; written with its answer, it's knowledge straight away.
 */
export function CardForm({
  card,
  initialQuestion = "",
  initialMode = "ask",
}: {
  card?: CardDraft;
  initialQuestion?: string;
  initialMode?: "ask" | "write";
}) {
  const { slug } = useLab();
  const index = useSearchIndex();
  const [state, formProps, pending] = useFormAction<FormState>(saveCard, {});
  const [mode, setMode] = useState<"ask" | "write">(card ? "write" : initialMode);
  const [question, setQuestion] = useState(card?.question ?? initialQuestion);
  const [chosenTopic, setChosenTopic] = useState<string | null>(card?.topic ?? null);
  const deferred = useDeferredValue(question);
  const similar = useMemo(
    () => (card || deferred.trim().length < 8 ? [] : search(index, deferred, 4).filter((h) => h.doc.kind === "card")),
    [card, index, deferred],
  );
  // Until someone picks a topic, it follows the closest card already in the lab.
  const topic = chosenTopic ?? similar[0]?.doc.topic ?? "other";
  const editing = Boolean(card);
  const submitLabel = !card ? (mode === "ask" ? "Ask the lab" : "Save to Thanos") : card.open ? "Save" : "Save changes";

  return (
    <form {...formProps} className="space-y-5">
      <input type="hidden" name="lab" value={slug} />
      {card && <input type="hidden" name="id" value={card.id} />}
      {!editing && (
        // Two buttons, one pressed: tabs would promise panels and arrow keys that aren't there.
        <div role="group" aria-label="What you're adding" className="inline-flex rounded-xl border border-line-strong bg-surface p-1 text-sm">
          {(["ask", "write"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={cn("rounded-lg px-3 py-1.5 transition-colors", mode === m ? "bg-surface-3 text-ink" : "text-muted hover:text-ink")}
            >
              {m === "ask" ? "Ask a question" : "Share what you know"}
            </button>
          ))}
        </div>
      )}

      <Field
        label="The question"
        hint={mode === "write" ? "Put it the way someone new would ask it: that's what they'll search for." : undefined}
      >
        <input
          name="question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          required
          minLength={8}
          maxLength={300}
          placeholder="Which grant do we charge fMRI scan time to?"
          className={INPUT}
        />
      </Field>
      {similar.length > 0 && <AlreadyHere hits={similar} />}

      {mode === "write" && (
        <Field
          label={card?.open ? "Your answer" : "The answer"}
          hint="Markdown works: **bold**, lists, `code`, [links](https://…). Say who holds a card or a password and how to ask them, not the number."
        >
          <textarea
            name="answer"
            defaultValue={card?.answer ?? ""}
            rows={10}
            required={!editing}
            placeholder="What you'd tell someone new, and who to ask if it changes."
            className={cn(INPUT, "leading-relaxed")}
          />
        </Field>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Topic">
          <select name="topic" value={topic} onChange={(e) => setChosenTopic(e.target.value)} className={INPUT}>
            {TOPICS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Other words for it" hint="What else someone might search for, separated by commas: p-card, chart string.">
          <input name="tags" defaultValue={card?.tags ?? ""} maxLength={300} className={INPUT} />
        </Field>
      </div>

      {editing && (
        <Field label="What changed? (optional)">
          <input name="note" maxLength={200} placeholder="The new fiscal year's chart string" className={INPUT} />
        </Field>
      )}

      {state.error && <Note tone="bad">{state.error}</Note>}
      {state.sensitive && (
        <Note tone="warn">
          <p className="font-medium">This looks like it has {joinKinds(state.sensitive)} in it.</p>
          <p className="mt-1">
            Everyone in the lab can read Thanos, including people who join years from now. It&apos;s safer to say who holds it and how to
            ask them. If it really belongs here, save it anyway.
          </p>
          <button type="submit" name="confirm" value="yes" disabled={pending} className={cn(BUTTON, "mt-3")}>
            Save anyway
          </button>
        </Note>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={PRIMARY}>
          {pending ? "Saving…" : submitLabel}
        </button>
        <Link href={card ? `/${slug}/c/${card.id}` : `/${slug}`} className={QUIET}>
          Cancel
        </Link>
        {mode === "ask" && !editing && (
          <span className="text-xs text-faint">It goes on the Open list, for anyone in the lab who knows.</span>
        )}
      </div>
    </form>
  );
}
