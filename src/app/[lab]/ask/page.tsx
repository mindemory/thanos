import { one } from "@/components/Frame";
import { CardForm } from "@/components/lab/CardForm";
import { requireMember } from "@/lib/labs";

export const metadata = { title: "Ask or add" };

export default async function AskPage({
  params,
  searchParams,
}: {
  params: Promise<{ lab: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { lab: slug } = await params;
  const { lab } = await requireMember(slug);
  const query = await searchParams;
  return (
    <div className="screen-in">
      <h1 className="title-1">Ask {lab.name}, or tell it something</h1>
      <p className="lede mt-3">
        Ask what you couldn&apos;t find, and it waits on the Open list for whoever knows. Or write down something you worked out, so
        nobody has to work it out again.
      </p>
      <div className="mt-8">
        <CardForm initialQuestion={one(query.q) ?? ""} initialMode={one(query.mode) === "write" ? "write" : "ask"} />
      </div>
    </div>
  );
}
