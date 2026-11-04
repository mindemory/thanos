// A lab's code, from its GitHub organizations: what people built, which toolboxes they forked, and
// what's still maintained. Asked of GitHub at most once an hour. Public repositories only: a token,
// if this Thanos has one, just lifts GitHub's limit on how often it can ask.

export interface Repo {
  owner: string;
  name: string;
  description: string;
  url: string;
  language: string | null;
  createdAt: string;
  pushedAt: string;
  stars: number;
  fork: boolean;
  archived: boolean;
  private: boolean;
}

interface GitHubRepo {
  name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  created_at: string;
  pushed_at: string;
  stargazers_count: number;
  fork: boolean;
  archived: boolean;
  private: boolean;
  owner: { login: string };
}

/** Owners from what an admin typed: logins, or links to them, separated by commas. */
export function githubOwners(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim().replace(/^https?:\/\/(www\.)?github\.com\//i, "").replace(/\/.*$/, ""))
    .filter((s) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(s))
    .slice(0, 3); // a few, so one lab can't spend the hourly allowance every lab shares
}

const OWNER = String.raw`[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?`;
const NAME = String.raw`[A-Za-z0-9._-]{1,100}`;
// Pages on github.com that sit where an owner would and aren't one.
const NOT_OWNERS = new Set(
  "orgs settings features topics marketplace sponsors apps about login explore notifications pulls issues new organizations users search enterprise".split(
    " ",
  ),
);

/** A repository as owner/name, from what someone typed: owner/name, or a link to it on GitHub. */
export function repoOf(text: string): string | null {
  if (text.length > 300) return null;
  const m = text
    .trim()
    .replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//i, "")
    .match(new RegExp(`^(${OWNER})\\/(${NAME}?)(?:\\.git)?(?:[/#?].*)?$`));
  return m && !NOT_OWNERS.has(m[1].toLowerCase()) && m[2] !== "." && m[2] !== ".." ? `${m[1]}/${m[2]}` : null;
}

/** Every repository some text links to on GitHub, as owner/name. */
export function findRepos(text: string): string[] {
  const found = [...text.matchAll(new RegExp(`github\\.com\\/(${OWNER})\\/(${NAME})`, "g"))]
    .map((m) => repoOf(`${m[1]}/${m[2].replace(/\.git$|[.,;:]+$/, "")}`))
    .filter((r): r is string => Boolean(r));
  return [...new Set(found)];
}

async function ask(path: string): Promise<Response> {
  const token = process.env.GITHUB_TOKEN;
  return fetch(`https://api.github.com${path}`, {
    headers: { Accept: "application/vnd.github+json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(5000),
  });
}

export async function labRepos(github: string): Promise<{ repos: Repo[]; problems: string[] }> {
  const owners = githubOwners(github);
  const problems: string[] = [];
  const lists = await Promise.all(
    owners.map(async (owner) => {
      try {
        // Public repositories only, token or not: a lab names any owner it likes, and must never see
        // another lab's private code through the token this Thanos happens to hold.
        const reply = await ask(`/users/${owner}/repos?per_page=100&sort=pushed`);
        if (!reply.ok) {
          problems.push(
            reply.status === 403 || reply.status === 429
              ? `GitHub is limiting how often Thanos can ask about ${owner}; try again in an hour.`
              : `GitHub couldn't find ${owner}.`,
          );
          return [];
        }
        return (await reply.json()) as GitHubRepo[];
      } catch {
        problems.push(`GitHub didn't answer about ${owner}.`);
        return [];
      }
    }),
  );
  const repos = lists.flat().map((r) => ({
    owner: r.owner.login,
    name: r.name,
    description: r.description ?? "",
    url: r.html_url,
    language: r.language,
    createdAt: r.created_at,
    pushedAt: r.pushed_at,
    stars: r.stargazers_count,
    fork: r.fork,
    archived: r.archived,
    private: r.private,
  }));
  repos.sort((a, b) => Date.parse(b.pushedAt) - Date.parse(a.pushedAt));
  return { repos, problems };
}
