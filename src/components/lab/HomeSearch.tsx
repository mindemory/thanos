"use client";

import { ArrowRight, BookOpen, FolderGit2, FolderKanban, MessageCirclePlus, MessageCircleQuestionMark, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import { Marked, useLab, useSearchIndex } from "@/components/lab/LabProvider";
import { plural } from "@/lib/format";
import { search, snippet, type Hit } from "@/lib/search";
import { topicOf } from "@/lib/topics";
import { cn } from "@/lib/utils";

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable));
}

function ResultRow({ hit, active, onHover }: { hit: Hit; active: boolean; onHover: () => void }) {
  const { doc, terms } = hit;
  const Icon = doc.kind === "repo" ? FolderGit2 : doc.kind === "project" ? FolderKanban : doc.open ? MessageCircleQuestionMark : BookOpen;
  const className = cn("tile tile-hover flex gap-3 p-3.5", active && "border-accent/50 bg-surface-2");
  const inner = (
    <>
      <Icon size={17} className={cn("mt-1 flex-shrink-0", doc.open ? "text-warn-ink" : "text-muted")} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="title-3 block">
          <Marked text={doc.title} terms={terms} />
        </span>
        {doc.body && (
          <span className="mt-1 block text-sm leading-relaxed text-muted">
            <Marked text={snippet(doc.body, terms)} terms={terms} />
          </span>
        )}
        <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint tabular-nums">
          <span>{doc.kind === "repo" ? "Code on GitHub" : (doc.meta ?? topicOf(doc.topic).label)}</span>
          {doc.open && <span className="text-warn-ink">Open question</span>}
          {doc.helped > 0 && <span className="num">Helped {doc.helped}</span>}
        </span>
      </span>
    </>
  );
  return (
    <li onMouseEnter={onHover}>
      {doc.kind === "repo" ? (
        <a href={doc.href} target="_blank" rel="noopener noreferrer" className={className}>
          {inner}
        </a>
      ) : (
        <Link href={doc.href} className={className}>
          {inner}
        </Link>
      )}
    </li>
  );
}

/**
 * The lab's search box. While it's empty the home page's own sections show beneath it; once
 * someone types, results take their place, ending with the way to ask if nothing fits.
 * "/" from anywhere on the page jumps to it, as in Alexandria.
 */
export function HomeSearch({ placeholder, children }: { placeholder: string; children: React.ReactNode }) {
  const { slug, name } = useLab();
  const index = useSearchIndex();
  const router = useRouter();
  const box = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const deferred = useDeferredValue(query);
  const hits = useMemo(() => search(index, deferred, 10), [index, deferred]);
  const asked = query.trim();
  const askHref = `/${slug}/ask?q=${encodeURIComponent(asked)}`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !isTyping(e.target)) {
        e.preventDefault();
        box.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const open = (hit: Hit | undefined) => {
    if (!hit) router.push(askHref);
    else if (hit.doc.kind === "repo") window.open(hit.doc.href, "_blank", "noopener,noreferrer");
    else router.push(hit.doc.href);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, hits.length)); // one past the results is "Ask the lab"
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && asked) {
      e.preventDefault();
      open(hits[active]);
    } else if (e.key === "Escape") {
      setQuery("");
    }
  };

  return (
    <div>
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint" aria-hidden="true" />
        <input
          ref={box}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label={`Search ${name}`}
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-2xl border border-field bg-surface py-3.5 pl-11 pr-12 text-base text-ink shadow-card placeholder:text-faint focus:border-accent"
        />
        <kbd className="num pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 rounded-md border border-line-strong px-1.5 text-xs text-faint sm:block">
          /
        </kbd>
      </div>
      {/* How many matches, said aloud as it changes, for someone who can't see the list fill in. */}
      <p className="sr-only" aria-live="polite">
        {asked ? (hits.length ? plural(hits.length, "match", "matches") : "Nothing matches yet") : ""}
      </p>
      {asked ? (
        <div className="fade-in mt-4">
          {hits.length > 0 ? (
            <ul className="space-y-2">
              {hits.map((hit, i) => (
                <ResultRow key={hit.doc.id} hit={hit} active={i === active} onHover={() => setActive(i)} />
              ))}
            </ul>
          ) : (
            <p className="px-1 py-6 text-center text-muted">Nothing in {name} matches that yet.</p>
          )}
          <Link
            href={askHref}
            onMouseEnter={() => setActive(hits.length)}
            className={cn("tile tile-hover mt-3 flex items-center gap-3 p-3.5", active === hits.length && "border-accent/50 bg-surface-2")}
          >
            <MessageCirclePlus size={17} className="flex-shrink-0 text-accent" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-muted">{hits.length ? "Not what you need?" : "Be the first to ask it."}</span>
              <span className="block truncate text-ink">Ask the lab: “{asked}”</span>
            </span>
            <ArrowRight size={16} className="flex-shrink-0 text-muted" aria-hidden="true" />
          </Link>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
