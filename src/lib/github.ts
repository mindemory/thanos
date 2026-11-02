// A lab's code, from its GitHub organizations: what people built, which toolboxes they forked, and
// what's still maintained. Asked of GitHub at most once an hour. Without GITHUB_TOKEN only public
// repositories show; with one, the private ones it can see show too (to lab members only).

export interface Repo {
  owner: string;
  name: string;
  description: string;
  url: string;
  language: string | null;
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
    .filter((s) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(s));
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
        let reply = process.env.GITHUB_TOKEN ? await ask(`/orgs/${owner}/repos?type=all&per_page=100&sort=pushed`) : null;
        if (!reply || reply.status === 404) reply = await ask(`/users/${owner}/repos?per_page=100&sort=pushed`);
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
    pushedAt: r.pushed_at,
    stars: r.stargazers_count,
    fork: r.fork,
    archived: r.archived,
    private: r.private,
  }));
  repos.sort((a, b) => Date.parse(b.pushedAt) - Date.parse(a.pushedAt));
  return { repos, problems };
}
