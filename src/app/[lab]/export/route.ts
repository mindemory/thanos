import { currentPerson, isOperator } from "@/lib/auth";
import { labCards, labRevisions, type CardSummary } from "@/lib/cards";
import { monthYear } from "@/lib/format";
import { labBySlug, roleIn } from "@/lib/labs";
import { TOPICS } from "@/lib/topics";

export const dynamic = "force-dynamic";

function byline(c: CardSummary): string {
  if (c.source) return [`from ${c.source}`, `added by ${c.askedBy ?? "Thanos"}`, c.checkedAt ? `checked ${monthYear(c.checkedAt)}` : null].filter(Boolean).join(" · ");
  const parts = [
    c.askedBy && c.askedBy !== c.answeredBy ? `asked by ${c.askedBy}` : null,
    `${c.askedBy && c.askedBy !== c.answeredBy ? "answered" : "written"} by ${c.answeredBy ?? "Thanos"}, ${monthYear(c.answeredAt ?? c.createdAt)}`,
    c.checkedAt ? `checked ${monthYear(c.checkedAt)}` : null,
    c.tags ? `also: ${c.tags}` : null,
  ];
  return parts.filter(Boolean).join(" · ");
}

function markdown(name: string, cards: CardSummary[], date: string): string {
  const answered = cards.filter((c) => !c.open);
  const open = cards.filter((c) => c.open);
  const out = [`# ${name}`, "", `What the lab knows, from Thanos, ${date}: ${answered.length} answers and ${open.length} open questions.`, ""];
  for (const topic of TOPICS) {
    const here = answered.filter((c) => c.topic === topic.id).sort((a, b) => a.question.localeCompare(b.question));
    if (!here.length) continue;
    out.push(`## ${topic.label}`, "");
    for (const c of here) out.push(`### ${c.question}`, "", c.answer, "", `*${byline(c)}*`, "");
  }
  if (open.length) {
    out.push("## Still open", "");
    for (const c of open) out.push(`- ${c.question} (asked ${c.askedBy ? `by ${c.askedBy}, ` : ""}${monthYear(c.createdAt)})`);
    out.push("");
  }
  return out.join("\n");
}

/** Everything a lab knows, for any of its members to keep: /[lab]/export?format=md or json. */
export async function GET(request: Request, { params }: { params: Promise<{ lab: string }> }) {
  const { lab: slug } = await params;
  const person = await currentPerson();
  if (!person) return new Response("Sign in first.\n", { status: 401 });
  const lab = await labBySlug(slug);
  if (!lab) return new Response("No such lab.\n", { status: 404 });
  if (!(await roleIn(lab.id, person.id)) && !isOperator(person)) return new Response("You aren't in this lab.\n", { status: 403 });

  const cards = await labCards(lab.id);
  const date = new Date().toISOString().slice(0, 10);
  const file = `${lab.slug}-thanos-${date}`;
  const headers = (type: string, ext: string) => ({
    "Content-Type": `${type}; charset=utf-8`,
    "Content-Disposition": `attachment; filename="${file}.${ext}"`,
    "Cache-Control": "no-store",
  });

  if (new URL(request.url).searchParams.get("format") === "json") {
    const revisions = await labRevisions(lab.id);
    const body = {
      lab: { name: lab.name, institution: lab.institution, website: lab.website, github: lab.github },
      exportedAt: new Date().toISOString(),
      cards: cards.map((c) => ({ ...c, versions: revisions.filter((v) => v.cardId === c.id) })),
    };
    return new Response(JSON.stringify(body, null, 2), { headers: headers("application/json", "json") });
  }
  return new Response(markdown(lab.name, cards, date), { headers: headers("text/markdown", "md") });
}
