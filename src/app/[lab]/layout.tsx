import { LabProvider } from "@/components/lab/LabProvider";
import { LabShell } from "@/components/lab/LabShell";
import { Note } from "@/components/ui";
import { currentPerson, nameOf } from "@/lib/auth";
import { labCards } from "@/lib/cards";
import { cardDoc, repoDoc } from "@/lib/docs";
import { draftCounts } from "@/lib/drafts";
import { dayMonth } from "@/lib/format";
import { labRepos } from "@/lib/github";
import { helpingIn, labBySlug, requireMember, roleIn, supportOpen } from "@/lib/labs";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ lab: string }> }) {
  // Named only for those who may open it: Next.js works out a page's title even when it redirects.
  const [person, lab] = await Promise.all([currentPerson(), labBySlug((await params).lab)]);
  const allowed = person !== null && lab !== null && ((await roleIn(lab.id, person.id)) !== null || helpingIn(person, lab));
  const name = allowed ? lab.name : "Thanos";
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
        {supportOpen(lab) && (
          <Note tone="warn" className="mb-6">
            The people who run this Thanos can open {lab.name} until {dayMonth(lab.supportUntil!)}, to help with something. Its admins
            let them in, and can shut them out in Settings.
          </Note>
        )}
        {children}
      </LabShell>
    </LabProvider>
  );
}
