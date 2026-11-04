import { Download, Inbox } from "lucide-react";
import Link from "next/link";

import { ConfirmSubmit, CopyButton } from "@/components/client";
import { DeleteLabForm, LabForm, NameForm } from "@/components/forms";
import { BUTTON, Note, QUIET } from "@/components/ui";
import { letOperatorsIn, rotateInvite, shutOperatorsOut, signOut } from "@/lib/actions";
import { dayMonth } from "@/lib/format";
import { inviteCode, labMembers, requireMember, supportOpen } from "@/lib/labs";
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
  // The invite link, the lab's details, letting operators in and deleting the lab are for its own
  // admins, not for someone running Thanos whom they've let in to help.
  const { lab, person, isAdmin, ownAdmin } = await requireMember(slug);
  const helping = supportOpen(lab);
  const [code, origin, members] = await Promise.all([
    ownAdmin ? inviteCode(lab.id) : Promise.resolve(null),
    siteOrigin(),
    ownAdmin ? Promise.resolve([]) : labMembers(lab.id),
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
        {ownAdmin ? (
          invite ? (
            <>
              <p className="leading-relaxed text-muted">
                Anyone with this link can join {lab.name}
                {lab.domains ? `, with an email address at ${lab.domains}` : ""}. Share it where the lab talks, like its Slack. If it gets
                somewhere it shouldn&apos;t, make a new one: the old one stops working.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <code className="code min-w-0 flex-1 rounded-xl border border-line-strong bg-surface-2 px-3.5 py-2 text-sm">{invite}</code>
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
        {!ownAdmin && <p className="mb-4 text-sm text-muted">Only the lab&apos;s own admins can change these.</p>}
        <LabForm
          lab={{ slug, name: lab.name, institution: lab.institution, website: lab.website, github: lab.github, domains: lab.domains }}
          readOnly={!ownAdmin}
        />
      </Section>

      <Section title="Keep a copy">
        <p className="leading-relaxed text-muted">
          Thanos should outlast any one account, this one included. Download everything {lab.name} knows: Markdown to read anywhere,
          or JSON, with every version, to move it somewhere else. A copy in the lab&apos;s GitHub now and then means none of it
          depends on one person.{" "}
          <Link href="/privacy" className="text-accent underline underline-offset-2">
            How Thanos handles the lab&apos;s data
          </Link>
          .
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

      {ownAdmin && (
        <Section title="Help from whoever runs Thanos">
          {helping ? (
            <>
              <p className="leading-relaxed text-muted">
                The people who run this Thanos can open {lab.name} until {dayMonth(lab.supportUntil!)}, to help with something. Everyone
                in the lab sees a note saying so.
              </p>
              <form action={shutOperatorsOut.bind(null, slug)} className="mt-4">
                <button type="submit" className={BUTTON}>
                  Shut them out now
                </button>
              </form>
            </>
          ) : (
            <>
              <p className="leading-relaxed text-muted">
                The people who run this Thanos can&apos;t open {lab.name}: not its cards, its people or its drafts. If you need their help
                with something in it, let them in for a week. Everyone in the lab sees a note while they can, and you can shut them
                out again any time.
              </p>
              <form action={letOperatorsIn.bind(null, slug)} className="mt-4">
                <button type="submit" className={BUTTON}>
                  Let them in for a week
                </button>
              </form>
            </>
          )}
        </Section>
      )}

      <Section title="You">
        <p className="mb-4 text-sm text-muted">Signed in as {person.email}.</p>
        <NameForm name={person.name ?? ""} />
        <form action={signOut} className="mt-5 border-t border-line pt-4">
          <button type="submit" className={QUIET}>
            Sign out
          </button>
        </form>
      </Section>

      {ownAdmin && (
        <Section title="Delete the lab">
          <p className="leading-relaxed text-muted">
            This deletes {lab.name} and everything in it, for everyone: its cards and every version of them, its drafts, and who&apos;s
            in it. It can&apos;t be undone, so download a copy first.
          </p>
          <div className="mt-4">
            <DeleteLabForm slug={slug} />
          </div>
        </Section>
      )}
    </div>
  );
}
