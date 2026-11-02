import { redirect } from "next/navigation";

import { Frame, one } from "@/components/Frame";
import { NameForm } from "@/components/forms";
import { currentPerson, safeNext } from "@/lib/auth";

export const metadata = { title: "Welcome" };

/** A guess at someone's name from their address: mrugank.dake@… is probably Mrugank Dake. */
function guessName(email: string): string {
  return email
    .split("@")[0]
    .split(/[._-]+/)
    .filter((w) => /^[a-z]+$/i.test(w))
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export default async function WelcomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const person = await currentPerson();
  if (!person) redirect("/login");
  return (
    <Frame>
      <h1 className="title-1">Welcome to Thanos</h1>
      <p className="lede mt-3">What should your lab call you?</p>
      <div className="mt-8">
        <NameForm name={person.name ?? guessName(person.email)} next={safeNext(one((await searchParams).next))} />
      </div>
    </Frame>
  );
}
