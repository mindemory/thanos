import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { ConfirmSubmit } from "@/components/client";
import { InviteForm, MemberForm } from "@/components/forms";
import { QUIET } from "@/components/ui";
import { cancelInviteAction, removeMember } from "@/lib/actions";
import { monthYear } from "@/lib/format";
import { labMembers, pendingInvites, requireMember, type Member } from "@/lib/labs";
import { labProjects } from "@/lib/projects";
import { yearOf } from "@/lib/timeline";

export const metadata = { title: "People" };

function given(m: Member): string {
  const parts = [
    m.answered && `answered ${m.answered}`,
    m.asking && `${m.asking} open ${m.asking === 1 ? "question" : "questions"}`,
    m.edits && `${m.edits} ${m.edits === 1 ? "edit" : "edits"}`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Nothing yet";
}

export default async function PeoplePage({ params }: { params: Promise<{ lab: string }> }) {
  const { lab: slug } = await params;
  // Managing people is for the lab's own admins, not for someone running Thanos they've let in.
  const { lab, person, ownAdmin } = await requireMember(slug);
  const [members, invited, projects] = await Promise.all([
    labMembers(lab.id),
    ownAdmin ? pendingInvites(lab.id) : Promise.resolve([]),
    labProjects(lab.id),
  ]);
  const current = members.filter((m) => m.role !== "alum");
  const alumni = members.filter((m) => m.role === "alum");
  const projectsOf = (id: string) => projects.filter((p) => p.people.some((x) => x.id === id));

  const row = (m: Member) => (
    <li key={m.id} id={`person-${m.id}`} className="tile scroll-mt-20 p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="title-3">{m.name}</p>
        {m.role === "admin" && <span className="rounded-full border border-accent/40 px-2 text-xs text-accent">Admin</span>}
        {m.title && <span className="text-sm text-muted">{m.title}</span>}
        {m.id === person.id && <span className="text-xs text-faint">you</span>}
      </div>
      <p className="mt-1 flex flex-wrap gap-x-3 text-sm text-faint tabular-nums">
        <a href={`mailto:${m.email}`} className="hover:text-ink">
          {m.email}
        </a>
        <span>Joined {yearOf(m.joinedAt)}</span>
        {m.leftAt && <span>Left {yearOf(m.leftAt)}</span>}
        <span className="num">{given(m)}</span>
      </p>
      {projectsOf(m.id).length > 0 && (
        <p className="mt-1 text-sm leading-relaxed text-muted">
          On{" "}
          {projectsOf(m.id).map((p, i) => (
            <span key={p.id}>
              {i > 0 && ", "}
              <Link href={`/${slug}/p/${p.slug}`} className="text-ink hover:text-accent">
                {p.name}
              </Link>
            </span>
          ))}
        </p>
      )}
      {(ownAdmin || m.id === person.id) && (
        <MemberForm
          slug={slug}
          personId={m.id}
          role={m.role}
          title={m.title}
          since={yearOf(m.joinedAt)}
          left={m.leftAt ? yearOf(m.leftAt) : null}
          canSetRole={ownAdmin}
        />
      )}
      {ownAdmin && m.id !== person.id && (
        <form action={removeMember.bind(null, slug, m.id)} className="mt-2">
          <ConfirmSubmit
            question={`Remove ${m.name} from ${lab.name}? What they wrote stays, under their name. Make them an alum instead to keep them reading.`}
            className={QUIET}
          >
            Remove from the lab
          </ConfirmSubmit>
        </form>
      )}
    </li>
  );

  return (
    <div className="screen-in">
      <h1 className="title-1">People</h1>
      <p className="lede mt-3">
        Who is in {lab.name}, and what each has given it. Alumni keep reading and answering after they leave, and what anyone wrote
        stays under their name.
      </p>
      <Link href={`/${slug}/history`} className={`${QUIET} mt-3`}>
        The lab over the years <ArrowRight size={14} aria-hidden="true" />
      </Link>
      {ownAdmin && (
        <section className="card mt-8 p-5">
          <InviteForm slug={slug} />
          {invited.length > 0 && (
            <div className="mt-5 border-t border-line pt-4">
              <h2 className="smallcaps">Invited, not signed in yet</h2>
              <ul className="mt-2 space-y-1">
                {invited.map((i) => (
                  <li key={i.email} className="flex flex-wrap items-center gap-x-3 text-sm">
                    <span className="num text-ink">{i.email}</span>
                    <span className="text-faint">{i.role === "admin" ? "as an admin" : "as a member"}, {monthYear(i.createdAt)}</span>
                    <form action={cancelInviteAction.bind(null, slug, i.email)} className="ml-auto">
                      <button type="submit" className={QUIET}>
                        Cancel
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
      <ul className="mt-8 space-y-2">{current.map(row)}</ul>
      {alumni.length > 0 && (
        <section className="mt-10">
          <h2 className="smallcaps mb-3">Alumni</h2>
          <ul className="space-y-2">{alumni.map(row)}</ul>
        </section>
      )}
    </div>
  );
}
