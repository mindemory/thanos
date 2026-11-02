import type { CardSummary } from "./cards";
import type { Repo } from "./github";
import type { Doc } from "./search";

// What search sees of a card or a repository.

export function cardDoc(slug: string, card: CardSummary): Doc {
  return {
    id: card.id,
    kind: "card",
    title: card.question,
    body: card.answer.slice(0, 6000),
    tags: card.tags,
    topic: card.topic,
    open: card.open,
    helped: card.helped,
    href: `/${slug}/c/${card.id}`,
    updatedAt: card.updatedAt,
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
