"use client";

import { Hand, ThumbsUp } from "lucide-react";
import { useState, useTransition } from "react";

import { useToast } from "@/components/Toasts";
import { BUTTON } from "@/components/ui";
import { react } from "@/lib/actions";
import { cn } from "@/lib/utils";

/**
 * "This helped" on an answer, "I need this too" on an open question: one per person, so the
 * counts mean people. Helped tells writers their answer mattered; need-this-too puts a question
 * higher on the Open list.
 */
export function Reaction({
  slug,
  id,
  kind,
  count,
  mine,
}: {
  slug: string;
  id: string;
  kind: "helped" | "wanted";
  count: number;
  mine: boolean;
}) {
  const notify = useToast();
  const [state, setState] = useState({ count, mine });
  const [pending, start] = useTransition();
  const Icon = kind === "helped" ? ThumbsUp : Hand;
  const label = kind === "helped" ? "This helped" : "I need this too";

  const toggle = () => {
    const turningOn = !state.mine;
    setState((s) => ({ count: s.count + (s.mine ? -1 : 1), mine: !s.mine }));
    start(async () => {
      const saved = await react(slug, id, kind);
      if (saved) setState(saved);
      if (saved?.mine && turningOn) notify(kind === "helped" ? "Marked as helpful" : "Noted: it moves up the Open list", "ok");
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={state.mine}
      className={cn(BUTTON, state.mine && "border-accent/50 bg-accent/10 text-accent hover:bg-accent/15")}
    >
      <Icon size={15} aria-hidden="true" />
      {label}
      {state.count > 0 && <span className="num text-muted">{state.count}</span>}
    </button>
  );
}
