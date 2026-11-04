import type { CardSummary } from "./cards";
import type { Repo } from "./github";
import type { Project } from "./projects";
import type { Doc } from "./search";
import { span, statusLabel } from "./timeline";

// What search sees of a card, a project or a repository.

export function cardDoc(slug: string, card: CardSummary): Doc {
  return {
    id: card.id,
    kind: "card",
    title: card.question,
    body: card.answer.slice(0, 6000),
    tags: [card.tags, card.project?.name].filter(Boolean).join(", "), // a project's name finds the cards about it
    topic: card.topic,
    open: card.open,
    helped: card.helped,
    href: `/${slug}/c/${card.id}`,
    updatedAt: card.updatedAt,
  };
}

/** A project, found by its name, what it is, its people, its channel, its code, its data and its papers. */
export function projectDoc(slug: string, p: Project): Doc {
  return {
    id: `project:${p.id}`,
    kind: "project",
    title: p.name,
    body: [p.summary, [...p.people.map((x) => x.name), ...p.others].join(", "), ...p.papers.map((x) => x.title)]
      .filter(Boolean)
      .join(" · ")
      .slice(0, 6000),
    tags: [p.slack.replace(/^#/, ""), ...p.repos.map((r) => r.split("/")[1]), ...p.data].join(", "),
    topic: "project",
    open: false,
    helped: 0,
    href: `/${slug}/p/${p.slug}`,
    updatedAt: p.updatedAt,
    meta: ["Project", statusLabel(p.status), span(p.started, p.ended, p.status)].filter(Boolean).join(" · "),
  };
}

export function repoDoc(repo: Repo): Doc {
  return {
    id: `repo:${repo.owner}/${repo.name}`,
    kind: "repo",
    title: repo.name,
    body: [repo.description, repo.language, repo.fork ? "a fork" : ""].filter(Boolean).join(" · "),
    tags: "",
    topic: "code",
    open: false,
    helped: 0,
    href: repo.url,
    updatedAt: repo.pushedAt,
  };
}
