import { redirect } from "next/navigation";

import { Frame, one } from "@/components/Frame";
import { LoginForm } from "@/components/forms";
import { Note } from "@/components/ui";
import { currentPerson, safeNext } from "@/lib/auth";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const next = safeNext(one(params.next));
  if (await currentPerson()) redirect(next);
  return (
    <Frame>
      <h1 className="title-1">Sign in</h1>
      <p className="lede mt-3">Thanos emails you a link, so there&apos;s no password to keep.</p>
      {one(params.expired) && (
        <Note tone="warn" className="mt-6">
          That link had expired or was already used. Here&apos;s how to get a new one.
        </Note>
      )}
      <div className="mt-8">
        <LoginForm next={next} />
      </div>
    </Frame>
  );
}
