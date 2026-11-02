import { LabProvider } from "@/components/lab/LabProvider";
import { LabShell } from "@/components/lab/LabShell";
import { nameOf } from "@/lib/auth";
import { labCards } from "@/lib/cards";
import { cardDoc, repoDoc } from "@/lib/docs";
import { draftCounts } from "@/lib/drafts";
import { labRepos } from "@/lib/github";
import { labBySlug, requireMember } from "@/lib/labs";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ lab: string }> }) {
  const name = (await labBySlug((await params).lab))?.name ?? "Thanos";
  return { title: { default: name, template: `%s · ${name}` } };
}

/**
 * Every lab page: only for its members, in the lab's frame, with the lab's whole memory (cards
 * and repositories) handed to the browser once for search.
 */
export default async function LabLayout({ children, params }: { children: React.ReactNode; params: Promise<{ lab: string }> }) {
  const { lab: slug } = await params;
  const { person, lab, isAdmin } = await requireMember(slug);
  const [cards, { repos }, drafts] = await Promise.all([
    labCards(lab.id),
    labRepos(lab.github),
    isAdmin ? draftCounts(lab.id) : null,
  ]);
  const docs = [...cards.map((c) => cardDoc(lab.slug, c)), ...repos.map(repoDoc)];
  return (
    <LabProvider value={{ slug: lab.slug, name: lab.name, docs }}>
      <LabShell
        slug={lab.slug}
        name={lab.name}
        institution={lab.institution}
        open={cards.filter((c) => c.open).length}
        review={drafts?.waiting ?? 0}
        personName={nameOf(person)}
      >
        {children}
      </LabShell>
    </LabProvider>
  );
}
