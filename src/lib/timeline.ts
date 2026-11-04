// A project's status and years, and the lab's History: the lab year by year, from who joined and
// who left, which projects started and finished, and the papers that came out. Nothing in it is a
// guess. A year shows only when someone gave it, or when Thanos saw it happen.
//
// No imports, so `node --test` can run its test file as is.

export const STATUSES = [
  { id: "active", label: "Active" },
  { id: "paused", label: "Paused" },
  { id: "done", label: "Done" },
  { id: "published", label: "Published" },
] as const;

export type Status = (typeof STATUSES)[number]["id"];

export function isStatus(id: string): id is Status {
  return STATUSES.some((s) => s.id === id);
}

export function statusLabel(id: string): string {
  return STATUSES.find((s) => s.id === id)?.label ?? "Active";
}

/** Done or published: a project that has ended, and so can say when. */
export function finished(status: string): boolean {
  return status === "done" || status === "published";
}

/** "2018–2021", "Since 2023" while it runs, or nothing when nobody has said. */
export function span(started: number | null, ended: number | null, status: string): string {
  if (started && ended) return started === ended ? String(started) : `${started}–${ended}`;
  if (started) return finished(status) ? `Started ${started}` : `Since ${started}`;
  if (ended) return `Until ${ended}`;
  return "";
}

/** A year from a form: null when it's empty, undefined when it isn't one, or hasn't come yet. */
export function readYear(text: string, now = new Date()): number | null | undefined {
  const t = text.trim();
  if (!t) return null;
  if (!/^\d{4}$/.test(t)) return undefined;
  const year = Number(t);
  return year >= 1950 && year <= now.getUTCFullYear() ? year : undefined;
}

export const yearOf = (isoDate: string) => new Date(isoDate).getUTCFullYear();

// ── History ──────────────────────────────────────────────────────────────────

export interface PersonMark {
  id: string;
  name: string;
  title: string;
  joinedAt: string;
  leftAt: string | null;
}

export interface ProjectMark {
  slug: string;
  name: string;
  status: string;
  started: number | null;
  ended: number | null;
}

export interface PaperMark {
  doi: string;
  title: string;
  detail: string;
  year: number;
  project: { slug: string; name: string };
}

export interface LabYear {
  year: number;
  published: PaperMark[];
  finished: ProjectMark[];
  started: ProjectMark[];
  joined: PersonMark[];
  left: PersonMark[];
  began: boolean; // the year the lab started keeping its memory in Thanos
}

/** The lab year by year, newest first. A year with nothing in it isn't there. */
export function labYears(
  people: PersonMark[],
  projects: ProjectMark[],
  papers: PaperMark[],
  began: number | null = null, // the year the lab started in Thanos
): LabYear[] {
  const years = new Map<number, LabYear>();
  const at = (year: number) => {
    let y = years.get(year);
    if (!y) {
      y = { year, published: [], finished: [], started: [], joined: [], left: [], began: false };
      years.set(year, y);
    }
    return y;
  };
  for (const p of papers) at(p.year).published.push(p);
  for (const p of projects) {
    if (p.started) at(p.started).started.push(p);
    if (p.ended && finished(p.status)) at(p.ended).finished.push(p);
  }
  for (const m of people) {
    at(yearOf(m.joinedAt)).joined.push(m);
    if (m.leftAt) at(yearOf(m.leftAt)).left.push(m);
  }
  if (began) at(began).began = true;
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  for (const y of years.values()) {
    y.published.sort((a, b) => a.project.name.localeCompare(b.project.name) || a.title.localeCompare(b.title));
    y.finished.sort(byName);
    y.started.sort(byName);
    y.joined.sort((a, b) => a.joinedAt.localeCompare(b.joinedAt) || byName(a, b));
    y.left.sort((a, b) => (a.leftAt ?? "").localeCompare(b.leftAt ?? "") || byName(a, b));
  }
  return [...years.values()].sort((a, b) => b.year - a.year);
}
