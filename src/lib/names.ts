// Names: a project's address from its own name, and the people a lab's chat names, matched to
// the people in the lab.
//
// No imports, so `node --test` can run its test file as is.

const plainLetters = (text: string) => text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

/** A project's address in its lab, from its name: "Pilot at 3T" lives at pilot-at-3t. */
export function slugFor(name: string): string {
  const slug = plainLetters(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return slug || "project";
}

/** What's left of a name to compare: visual_search, Visual-Search and "visual search" meet. */
export function nameKey(text: string): string {
  return plainLetters(text).replace(/[^a-z0-9]/g, "");
}

const words = (name: string) => plainLetters(name).replace(/[^a-z0-9' -]/g, " ").split(/\s+/).filter(Boolean);

/**
 * Names from a lab's chat, matched to the lab's own people: the same full name, or a first name
 * only one of them has, when nothing else in the two names disagrees. Whoever isn't matched is
 * kept by name, as the chat had it.
 */
export function matchNames(names: string[], people: { id: string; name: string }[]): { ids: string[]; others: string[] } {
  const ids: string[] = [];
  const others: string[] = [];
  const known = people.map((p) => ({ id: p.id, words: words(p.name) }));
  for (const name of names) {
    const said = words(name);
    if (!said.length) continue;
    const same = known.find((p) => p.words.join(" ") === said.join(" "));
    const firstOnly = known.filter((p) => p.words[0] === said[0]);
    const agree = (p: { words: string[] }) => p.words.length === 1 || said.length === 1 || p.words.at(-1) === said.at(-1);
    const match = same ?? (firstOnly.length === 1 && agree(firstOnly[0]) ? firstOnly[0] : undefined);
    if (match && !ids.includes(match.id)) ids.push(match.id);
    else if (!match && !others.includes(name.trim())) others.push(name.trim());
  }
  return { ids, others };
}
