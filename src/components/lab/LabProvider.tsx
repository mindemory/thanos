"use client";

import { createContext, useContext, useMemo } from "react";

import { buildIndex, highlight, type Doc, type Index } from "@/lib/search";

// The lab every page under /[lab] is about, and its whole memory as search documents, sent once
// by the lab's layout. Search, and the "already in Thanos?" check when someone asks, read it here.

export interface LabClient {
  slug: string;
  name: string;
  docs: Doc[];
}

const LabContext = createContext<LabClient | null>(null);

export function LabProvider({ value, children }: { value: LabClient; children: React.ReactNode }) {
  return <LabContext.Provider value={value}>{children}</LabContext.Provider>;
}

export function useLab(): LabClient {
  const lab = useContext(LabContext);
  if (!lab) throw new Error("useLab outside a lab page");
  return lab;
}

export function useSearchIndex(): Index {
  const { docs } = useLab();
  return useMemo(() => buildIndex(docs), [docs]);
}

/** Text with the words a search matched marked. */
export function Marked({ text, terms }: { text: string; terms: string[] }) {
  return (
    <>
      {highlight(text, terms).map((part, i) =>
        part.hit ? (
          <mark key={i} className="rounded-sm bg-accent/20 px-0.5 text-ink">
            {part.text}
          </mark>
        ) : (
          part.text
        ),
      )}
    </>
  );
}
