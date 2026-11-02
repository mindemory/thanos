"use client";

import { Check, Copy } from "lucide-react";
import { startTransition, useActionState, useState } from "react";

import { useToast } from "@/components/Toasts";
import { BUTTON } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * Props that run a server action from a form, spread onto it. Once the page is interactive the
 * submit handler sends it, which, unlike a form's action alone, doesn't clear the form when it
 * returns: a warning or a mistake never costs someone what they typed. The button that submitted
 * is sent too, so a "Save anyway" button can say so. Before then, the action prop posts the form
 * to the server as is, so nothing typed ever ends up in the address bar.
 */
export function useFormAction<S extends object>(action: (state: S, form: FormData) => Promise<S>, initial: S) {
  // S is a plain object, never a promise, so Awaited<S> is S; TypeScript can't see that for a generic.
  const [state, dispatch, pending] = useActionState<S, FormData>(
    action as (state: Awaited<S>, form: FormData) => Promise<S>,
    initial as Awaited<S>,
  );
  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); // React then leaves the action prop alone
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const data = new FormData(event.currentTarget, submitter);
    startTransition(() => dispatch(data));
  };
  return [state, { action: dispatch, onSubmit }, pending] as const;
}

/** Copies text and says so: a toast, which a screen reader hears too, and a tick for a moment. */
function useCopy(text: string) {
  const notify = useToast();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        notify("Copied", "ok");
        window.setTimeout(() => setCopied(false), 1600);
      },
      () => {
        // No clipboard here (an insecure page, or permission refused): the text is on screen to select.
      },
    );
  };
  return [copied, copy] as const;
}

export function CopyButton({ text, label = "Copy", className }: { text: string; label?: string; className?: string }) {
  const [copied, copy] = useCopy(text);
  const Icon = copied ? Check : Copy;
  return (
    <button type="button" onClick={copy} className={cn(BUTTON, className)}>
      <Icon size={15} aria-hidden="true" />
      {copied ? "Copied" : label}
    </button>
  );
}

/**
 * A copy button that is only an icon, for beside a value or on a code block. Always shown, not
 * only on hover, so it's there on a phone and for the keyboard; its label says what it copies.
 */
export function CopyIcon({ text, label, className }: { text: string; label: string; className?: string }) {
  const [copied, copy] = useCopy(text);
  const Icon = copied ? Check : Copy;
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={label}
      className={cn(
        "inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md align-middle text-faint transition-colors hover:bg-surface-3 hover:text-ink",
        className,
        copied && "text-ok-ink",
      )}
    >
      <Icon size={13} aria-hidden="true" />
    </button>
  );
}

/** What a copy button's label quotes of a long value. */
function quoted(text: string): string {
  return text.length > 48 ? `${text.slice(0, 47)}…` : text;
}

/**
 * Something to paste somewhere else (a path, a command, a chart string), set in mono with a copy
 * button after it. A short one stays on one line, so a chart string is never split at a hyphen;
 * a long path may break anywhere rather than run off a phone. One or two characters aren't worth
 * a button.
 */
export function Value({ text }: { text: string }) {
  return (
    <>
      <code className={cn("code rounded-md bg-surface-2 px-1.5 py-0.5 text-[0.875em] text-ink", text.length <= 32 && "whitespace-nowrap")}>
        {text}
      </code>
      {text.trim().length > 2 && <CopyIcon text={text} label={`Copy ${quoted(text)}`} className="-my-1 ml-0.5" />}
    </>
  );
}

/** A block of code or commands, with its language when the writer gave one, and a copy button. */
export function CodeBlock({ code, lang, className }: { code: string; lang?: string; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-xl border border-line bg-surface-2", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-line py-1 pl-4 pr-1.5">
        <span className="code text-xs text-muted">{lang}</span>
        <CopyIcon text={code} label="Copy the code" className="text-muted" />
      </div>
      <pre className="code overflow-x-auto p-4 text-sm leading-relaxed text-ink">{code}</pre>
    </div>
  );
}

/** A submit button that asks first, for things like removing a card. */
export function ConfirmSubmit({ question, className, children }: { question: string; className?: string; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(question)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
