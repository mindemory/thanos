import { LabProvider } from "@/components/lab/LabProvider";
import { LabShell } from "@/components/lab/LabShell";
import { Note } from "@/components/ui";
import { currentPerson, nameOf } from "@/lib/auth";
import { labCards } from "@/lib/cards";
import { cardDoc, projectDoc, repoDoc } from "@/lib/docs";
import { draftCounts, projectDraftCounts } from "@/lib/drafts";
import { dayMonth } from "@/lib/format";
import { labRepos } from "@/lib/github";
import { helpingIn, labBySlug, requireMember, roleIn, supportOpen } from "@/lib/labs";
import { labProjects } from "@/lib/projects";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ lab: string }> }) {
  // Named only for those who may open it: Next.js works out a page's title even when it redirects.
  const [person, lab] = await Promise.all([currentPerson(), labBySlug((await params).lab)]);
  const allowed = person !== null && lab !== null && ((await roleIn(lab.id, person.id)) !== null || helpingIn(person, lab));
  const name = allowed ? lab.name : "Thanos";
  return { title: { default: name, template: `%s · ${name}` } };
}

/**
 * Every lab page: only for its members, in the lab's frame, with the lab's whole memory (cards,
 * projects and repositories) handed to the browser once for search.
 */
export default async function LabLayout({ children, params }: { children: React.ReactNode; params: Promise<{ lab: string }> }) {
  const { lab: slug } = await params;
  const { person, lab, isAdmin } = await requireMember(slug);
  const [cards, projects, { repos }, drafts] = await Promise.all([
    labCards(lab.id),
    labProjects(lab.id),
    labRepos(lab.github),
    isAdmin ? Promise.all([draftCounts(lab.id), projectDraftCounts(lab.id)]) : null,
  ]);
  const docs = [...cards.map((c) => cardDoc(lab.slug, c)), ...projects.map((p) => projectDoc(lab.slug, p)), ...repos.map(repoDoc)];
  const options = projects.map((p) => ({ id: p.id, slug: p.slug, name: p.name, status: p.status }));
  return (
    <LabProvider value={{ slug: lab.slug, name: lab.name, docs, projects: options }}>
      <LabShell
        slug={lab.slug}
        name={lab.name}
        institution={lab.institution}
        open={cards.filter((c) => c.open).length}
        review={drafts ? drafts[0].waiting + drafts[1].waiting : 0}
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
