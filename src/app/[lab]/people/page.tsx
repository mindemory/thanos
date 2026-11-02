import { ConfirmSubmit } from "@/components/client";
import { MemberForm } from "@/components/forms";
import { QUIET } from "@/components/ui";
import { removeMember } from "@/lib/actions";
import { monthYear } from "@/lib/format";
import { labMembers, requireMember, type Member } from "@/lib/labs";

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
  const { lab, person, isAdmin } = await requireMember(slug);
  const members = await labMembers(lab.id);
  const current = members.filter((m) => m.role !== "alum");
  const alumni = members.filter((m) => m.role === "alum");

  const row = (m: Member) => (
    <li key={m.id} className="tile p-4">
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
        <span>Joined {monthYear(m.joinedAt)}</span>
        <span className="num">{given(m)}</span>
      </p>
      {(isAdmin || m.id === person.id) && (
        <MemberForm slug={slug} personId={m.id} role={m.role} title={m.title} canSetRole={isAdmin} />
      )}
      {isAdmin && m.id !== person.id && (
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
