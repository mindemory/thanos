import { CircleCheck, DoorOpen, FileText, Flag, UserPlus, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { Note } from "@/components/ui";
import { labMembers, requireMember } from "@/lib/labs";
import { labProjects } from "@/lib/projects";
import { labYears, span, yearOf, type PersonMark } from "@/lib/timeline";

export const metadata = { title: "History" };

/** One kind of thing in a year: what happened, then to what or whom. */
function Row({ label, icon: Icon, children }: { label: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[7.5rem_1fr] sm:gap-4">
      <dt className="smallcaps flex items-center gap-1.5 pt-1">
        <Icon size={13} className="flex-shrink-0" aria-hidden="true" />
        {label}
      </dt>
      <dd className="min-w-0 space-y-1 leading-relaxed">{children}</dd>
    </div>
  );
}

export default async function HistoryPage({ params }: { params: Promise<{ lab: string }> }) {
  const { lab: slug } = await params;
  const { lab } = await requireMember(slug);
  const [members, projects] = await Promise.all([labMembers(lab.id), labProjects(lab.id)]);
  const papers = projects.flatMap((p) =>
    p.papers.flatMap((paper) =>
      paper.year ? [{ doi: paper.doi, title: paper.title || paper.doi, detail: paper.detail, year: paper.year, project: { slug: p.slug, name: p.name } }] : [],
    ),
  );
  const years = labYears(
    members.map((m) => ({ id: m.id, name: m.name, title: m.title, joinedAt: m.joinedAt, leftAt: m.leftAt })),
    projects,
    papers,
    yearOf(lab.createdAt),
  );

  const person = (m: PersonMark, i: number, also?: string) => (
    <span key={m.id}>
      {i > 0 && " · "}
      <Link href={`/${slug}/people#person-${m.id}`} className="text-ink hover:text-accent">
        {m.name}
      </Link>
      {m.title && <span className="text-muted">, {m.title}</span>}
      {also && <span className="text-faint tabular-nums"> ({also})</span>}
    </span>
  );

  return (
    <div className="screen-in">
      <p className="eyebrow">{lab.name}</p>
      <h1 className="title-1 mt-2">History</h1>
      <p className="lede mt-3">
        The lab over the years, newest first: who joined and who left, which projects started and finished, and the papers that came
        out. People&apos;s years start from when they joined Thanos; the years they were really in the lab can go on the{" "}
        <Link href={`/${slug}/people`} className="text-accent underline underline-offset-2">
          People
        </Link>{" "}
        page, and a project&apos;s on its own page.
      </p>

      {years.length > 4 && (
        <nav aria-label="Years" className="mt-6 flex flex-wrap gap-x-3 gap-y-1">
          {years.map((y) => (
            <a key={y.year} href={`#y${y.year}`} className="num text-sm text-muted hover:text-accent">
              {y.year}
            </a>
          ))}
        </nav>
      )}

      {!projects.length && (
        <Note className="mt-6">
          No projects yet, so only people show here.{" "}
          <Link href={`/${slug}/projects`} className="text-accent underline underline-offset-2">
            Start one
          </Link>
          , and when it started, when it finished and its papers show here too.
        </Note>
      )}

      <ol className="mt-10 space-y-10 border-l border-line pl-6">
        {years.map((y) => (
          <li key={y.year} id={`y${y.year}`} className="relative scroll-mt-20">
            <span className="absolute -left-[1.85rem] top-2.5 h-2.5 w-2.5 rounded-full bg-accent ring-4 ring-bg" aria-hidden="true" />
            <h2 className="num text-2xl text-ink">{y.year}</h2>
            <dl className="mt-3 space-y-3">
              {y.published.length > 0 && (
                <Row label="Published" icon={FileText}>
                  {y.published.map((p) => (
                    <p key={`${p.project.slug}:${p.doi}`}>
                      <a href={`https://doi.org/${p.doi}`} target="_blank" rel="noopener noreferrer" className="text-ink hover:text-accent">
                        {p.title}
                      </a>
                      <span className="text-sm text-muted">
                        {p.detail && ` · ${p.detail}`} · from{" "}
                        <Link href={`/${slug}/p/${p.project.slug}`} className="hover:text-accent">
                          {p.project.name}
                        </Link>
                      </span>
                    </p>
                  ))}
                </Row>
              )}
              {y.finished.length > 0 && (
                <Row label="Finished" icon={CircleCheck}>
                  {y.finished.map((p) => (
                    <p key={p.slug}>
                      <Link href={`/${slug}/p/${p.slug}`} className="text-ink hover:text-accent">
                        {p.name}
                      </Link>
                      <span className="text-sm text-faint tabular-nums"> · {span(p.started, p.ended, p.status)}</span>
                    </p>
                  ))}
                </Row>
              )}
              {y.started.length > 0 && (
                <Row label="Started" icon={Flag}>
                  {y.started.map((p) => (
                    <p key={p.slug}>
                      <Link href={`/${slug}/p/${p.slug}`} className="text-ink hover:text-accent">
                        {p.name}
                      </Link>
                    </p>
                  ))}
                </Row>
              )}
              {y.joined.length > 0 && (
                <Row label="Joined" icon={UserPlus}>
                  <p>{y.joined.map((m, i) => person(m, i))}</p>
                </Row>
              )}
              {y.left.length > 0 && (
                <Row label="Left" icon={DoorOpen}>
                  <p>{y.left.map((m, i) => person(m, i, span(yearOf(m.joinedAt), yearOf(m.leftAt!), "done")))}</p>
                </Row>
              )}
            </dl>
            {y.began && <p className="mt-3 text-sm text-faint">{lab.name} started keeping its memory in Thanos.</p>}
          </li>
        ))}
      </ol>
    </div>
  );
}
