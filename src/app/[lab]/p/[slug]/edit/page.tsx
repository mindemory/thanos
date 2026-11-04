import { notFound } from "next/navigation";

import { ProjectForm } from "@/components/lab/ProjectForm";
import { requireMember } from "@/lib/labs";
import { formChoices, projectBySlug, projectValues } from "@/lib/projects";

export const metadata = { title: "Edit project" };

export default async function EditProjectPage({ params }: { params: Promise<{ lab: string; slug: string }> }) {
  const { lab: slug, slug: address } = await params;
  const { lab } = await requireMember(slug);
  const project = await projectBySlug(lab.id, address);
  if (!project) notFound();
  const choices = await formChoices(lab);
  return (
    <div className="screen-in">
      <h1 className="title-1">Edit {project.name}</h1>
      <p className="lede mt-3">Anyone in the lab can bring a project up to date. The version before stays in its history.</p>
      <div className="mt-8">
        <ProjectForm project={{ id: project.id, slug: project.slug }} values={projectValues(project)} people={choices.people} repos={choices.repos} />
      </div>
    </div>
  );
}
