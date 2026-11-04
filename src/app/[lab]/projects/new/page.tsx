import { ProjectForm } from "@/components/lab/ProjectForm";
import { requireMember } from "@/lib/labs";
import { formChoices } from "@/lib/projects";

export const metadata = { title: "Start a project" };

export default async function NewProjectPage({ params }: { params: Promise<{ lab: string }> }) {
  const { lab: slug } = await params;
  const { lab, person } = await requireMember(slug);
  const choices = await formChoices(lab);
  // Whoever starts it is on it, if they're in the lab.
  const me = choices.people.find((p) => p.id === person.id);
  return (
    <div className="screen-in">
      <h1 className="title-1">Start a project</h1>
      <p className="lede mt-3">
        A name is enough to start. Add who is on it, its code, where its data lives and its papers now or as they come, so the next
        person finds them in one place.
      </p>
      <div className="mt-8">
        <ProjectForm
          values={{
            name: "",
            status: "active",
            summary: "",
            started: null, // a year nobody gave would show in History
            ended: null,
            people: me ? [{ id: me.id, name: me.name }] : [],
            others: [],
            repos: [],
            data: [],
            slack: "",
            papers: [],
          }}
          people={choices.people}
          repos={choices.repos}
        />
      </div>
    </div>
  );
}
