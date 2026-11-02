import { Download, Inbox } from "lucide-react";
import Link from "next/link";

import { ConfirmSubmit, CopyButton } from "@/components/client";
import { LabForm, NameForm } from "@/components/forms";
import { BUTTON, Note, QUIET } from "@/components/ui";
import { rotateInvite, signOut } from "@/lib/actions";
import { inviteCode, labMembers, requireMember } from "@/lib/labs";
import { siteOrigin } from "@/lib/origin";

export const metadata = { title: "Settings" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5 md:p-6">
      <h2 className="title-2">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function SettingsPage({ params }: { params: Promise<{ lab: string }> }) {
  const { lab: slug } = await params;
  const { lab, person, isAdmin } = await requireMember(slug);
  const [code, origin, members] = await Promise.all([
    isAdmin ? inviteCode(lab.id) : Promise.resolve(null),
    siteOrigin(),
    isAdmin ? Promise.resolve([]) : labMembers(lab.id),
  ]);
  const invite = code && origin ? `${origin}/join/${code}` : null;
  const admins = members.filter((m) => m.role === "admin").map((m) => m.name);

  return (
    <div className="screen-in space-y-6">
      <div>
        <h1 className="title-1">Settings</h1>
        <p className="lede mt-3">{lab.name}, and you in it.</p>
      </div>

      <Section title="Invite people">
        {isAdmin ? (
          invite ? (
            <>
              <p className="leading-relaxed text-muted">
                Anyone with this link can join {lab.name}
                {lab.domains ? `, with an email address at ${lab.domains}` : ""}. Share it where the lab talks, like its Slack. If it gets
                somewhere it shouldn&apos;t, make a new one: the old one stops working.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <code className="num min-w-0 flex-1 break-all rounded-xl border border-line-strong bg-surface-2 px-3.5 py-2 text-sm">{invite}</code>
                <CopyButton text={invite} label="Copy link" />
              </div>
              <form action={rotateInvite.bind(null, slug)} className="mt-3">
                <ConfirmSubmit question="Make a new invite link? The old one stops working." className={QUIET}>
                  Make a new link
                </ConfirmSubmit>
              </form>
            </>
          ) : (
            <Note tone="warn">Set THANOS_URL so Thanos knows its own address, and the invite link shows here.</Note>
          )
        ) : (
          <p className="leading-relaxed text-muted">
            Ask {admins.length ? admins.join(" or ") : "an admin"} for the invite link.
          </p>
        )}
      </Section>

      {isAdmin && (
        <Section title="Bring in the lab's Slack">
          <p className="leading-relaxed text-muted">
            Years of answers are already sitting in the lab&apos;s Slack. Thanos can turn its public channels into drafts, with a model
            running on your own computer, for an admin to keep, fix or drop one by one.
          </p>
          <Link href={`/${slug}/review`} className={`${BUTTON} mt-4`}>
            <Inbox size={15} aria-hidden="true" /> Review drafts
          </Link>
        </Section>
      )}

      <Section title="About the lab">
        {!isAdmin && <p className="mb-4 text-sm text-muted">Only the lab&apos;s admins can change these.</p>}
        <LabForm
          lab={{ slug, name: lab.name, institution: lab.institution, website: lab.website, github: lab.github, domains: lab.domains }}
          readOnly={!isAdmin}
        />
      </Section>

      <Section title="Keep a copy">
        <p className="leading-relaxed text-muted">
          Thanos should outlast any one account, this one included. Download everything {lab.name} knows: Markdown to read anywhere,
          or JSON, with every version, to move it somewhere else. A copy in the lab&apos;s GitHub now and then means none of it
          depends on one person.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={`/${slug}/export?format=md`} className={BUTTON}>
            <Download size={15} aria-hidden="true" /> Markdown
          </a>
          <a href={`/${slug}/export?format=json`} className={BUTTON}>
            <Download size={15} aria-hidden="true" /> JSON
          </a>
        </div>
      </Section>

      <Section title="You">
        <p className="mb-4 text-sm text-muted">Signed in as {person.email}.</p>
        <NameForm name={person.name ?? ""} />
        <form action={signOut} className="mt-5 border-t border-line pt-4">
          <button type="submit" className={QUIET}>
            Sign out
          </button>
        </form>
      </Section>
    </div>
  );
}
