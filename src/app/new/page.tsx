import { redirect } from "next/navigation";

import { Frame } from "@/components/Frame";
import { LabForm } from "@/components/forms";
import { canStartLab, currentPerson } from "@/lib/auth";

export const metadata = { title: "Start a lab" };

export default async function NewLabPage() {
  const person = await currentPerson();
  if (!person) redirect("/login?next=/new");
  if (!canStartLab(person)) {
    return (
      <Frame>
        <h1 className="title-1">Start a lab</h1>
        <p className="lede mt-3">
          Only the people who run this Thanos can start a lab here. Ask them, or run a copy of your own.
        </p>
      </Frame>
    );
  }
  return (
    <Frame wide>
      <h1 className="title-1">Start a lab</h1>
      <p className="lede mt-3">
        Any group that keeps knowledge together works: a lab, a core facility, a team. It starts with the questions nearly every lab
        gets asked, left open for the people who know. Its first admin, you or whoever you name below, gets an invite link to share.
      </p>
      <div className="mt-8">
        <LabForm />
      </div>
    </Frame>
  );
}
