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

export function CopyButton({ text, label = "Copy", className }: { text: string; label?: string; className?: string }) {
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
  const Icon = copied ? Check : Copy;
  return (
    <button type="button" onClick={copy} className={cn(BUTTON, className)}>
      <Icon size={15} aria-hidden="true" />
      {copied ? "Copied" : label}
    </button>
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
