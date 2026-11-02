import Link from "next/link";

import { Frame, one } from "@/components/Frame";
import { PRIMARY } from "@/components/ui";
import { confirmLink } from "@/lib/actions";
import { peekLoginLink } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

/**
 * Where a sign-in link lands. Opening it only shows a button: the link is used when the button
 * is pressed, because the email scanners universities run open every link before people do.
 */
export default async function VerifyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const token = one((await searchParams).token) ?? "";
  const email = token ? await peekLoginLink(token) : null;
  if (!email) {
    return (
      <Frame>
        <h1 className="title-1">That link doesn&apos;t work</h1>
        <p className="lede mt-3">It has expired, or it was already used. A link works once, for 20 minutes.</p>
        <Link href="/login" className={`${PRIMARY} mt-8`}>
          Get a new link
        </Link>
      </Frame>
    );
  }
  return (
    <Frame>
      <h1 className="title-1">Sign in</h1>
      <p className="lede mt-3">
        As <span className="text-ink">{email}</span>.
      </p>
      <form action={confirmLink} className="mt-8">
        <input type="hidden" name="token" value={token} />
        <button type="submit" className={PRIMARY}>
          Continue
        </button>
      </form>
    </Frame>
  );
}
