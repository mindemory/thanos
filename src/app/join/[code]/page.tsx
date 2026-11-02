import Link from "next/link";
import { redirect } from "next/navigation";

import { Frame } from "@/components/Frame";
import { Note, PRIMARY, QUIET } from "@/components/ui";
import { joinLab, signOut } from "@/lib/actions";
import { currentPerson } from "@/lib/auth";
import { domainAllowed, labByInvite, roleIn } from "@/lib/labs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Join a lab" };

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const [lab, person] = await Promise.all([labByInvite(code), currentPerson()]);
  if (!lab) {
    return (
      <Frame>
        <h1 className="title-1">This invite link doesn&apos;t work</h1>
        <p className="lede mt-3">Someone may have made a new one. Ask your lab for the current link.</p>
      </Frame>
    );
  }
  if (person && (await roleIn(lab.id, person.id))) redirect(`/${lab.slug}`);

  return (
    <Frame>
      <p className="eyebrow">{lab.institution || "An invitation"}</p>
      <h1 className="title-1 mt-2">Join {lab.name}</h1>
      <p className="lede mt-3">
        What the lab has worked out, from chart strings to toolboxes, and the questions still waiting for someone who knows.
      </p>
      <div className="mt-8">
        {!person ? (
          <Link href={`/login?next=${encodeURIComponent(`/join/${code}`)}`} className={PRIMARY}>
            Sign in to join
          </Link>
        ) : !domainAllowed(lab, person.email) ? (
          <Note tone="warn">
            {lab.name} takes addresses at {lab.domains} only, and you&apos;re signed in as {person.email}.
            <form action={signOut} className="mt-3">
              <button type="submit" className={QUIET}>
                Sign in with another address
              </button>
            </form>
          </Note>
        ) : (
          <form action={joinLab} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="code" value={code} />
            <button type="submit" className={PRIMARY}>
              Join {lab.name}
            </button>
            <span className="text-sm text-faint">as {person.email}</span>
          </form>
        )}
      </div>
    </Frame>
  );
}
