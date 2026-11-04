// Papers by DOI. Someone gives a DOI, and doi.org, which answers for every agency that issues them
// (Crossref, DataCite and the rest), says what it is: the title, who wrote it, where and when it
// came out. Only the DOI goes with the question.
//
// No imports, so `node --test` can run its test file as is.

export interface Paper {
  doi: string; // lower case, with no doi.org in front
  title: string; // empty until doi.org has said
  detail: string; // "Kucsko et al. · Nature"
  year: number | null;
}

const DOI = /^10\.\d{4,9}\/\S+$/;
const LONGEST = 300; // longer than any DOI anyone has been given

/** A DOI from what someone typed or pasted: 10.1038/…, doi:10.1038/…, or a doi.org link. */
export function doiOf(text: string): string | null {
  let t = text.trim();
  if (t.length > LONGEST) return null;
  try {
    t = decodeURIComponent(t);
  } catch {
    // Not encoded after all: read it as typed.
  }
  t = t.replace(/^(?:https?:\/\/)?(?:dx\.)?doi\.org\//i, "").replace(/^doi:\s*/i, "");
  // The full stop or bracket after one in a sentence isn't part of it. Counted back from the end,
  // so a long run of them costs no more than reading it once.
  let end = t.length;
  while (end > 0 && ".,;)]".includes(t[end - 1])) end--;
  t = t.slice(0, end);
  return DOI.test(t) ? t.toLowerCase() : null;
}

/** The DOIs in a block of text, one a line or separated by spaces, and whatever isn't one. */
export function readDois(text: string): { dois: string[]; wrong: string[] } {
  const dois: string[] = [];
  const wrong: string[] = [];
  for (const piece of text.split(/[\s,]+/).filter(Boolean)) {
    const doi = doiOf(piece);
    if (!doi) wrong.push(piece);
    else if (!dois.includes(doi)) dois.push(doi);
  }
  return { dois, wrong };
}

/** Every DOI some text mentions, so the Slack importer can check what a model says it read. */
export function findDois(text: string): string[] {
  const found = (text.match(/\b10\.\d{4,9}\/[^\s"'<>|]+/g) ?? []).map(doiOf).filter((d): d is string => Boolean(d));
  return [...new Set(found)];
}

const words = (v: unknown) => (typeof v === "string" ? v.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : "");
const first = (v: unknown) => (Array.isArray(v) ? words(v[0]) : words(v));

function yearIn(date: unknown): number | null {
  const parts = (date as { "date-parts"?: unknown[][] } | undefined)?.["date-parts"]?.[0];
  const year = Number(parts?.[0]);
  return Number.isInteger(year) && year > 1000 ? year : null;
}

/** A paper from what doi.org says of it (CSL JSON). */
export function paperOf(doi: string, csl: Record<string, unknown>): Paper {
  const authors = (Array.isArray(csl.author) ? csl.author : []) as { family?: string; literal?: string }[];
  const names = authors.map((a) => words(a.family) || words(a.literal)).filter(Boolean);
  const who = names.length > 2 ? `${names[0]} et al.` : names.join(" & ");
  const where =
    first(csl["container-title"]) || first((csl.institution as { name?: string }[] | undefined)?.[0]?.name) || words(csl.publisher);
  return {
    doi,
    title: first(csl.title).slice(0, 300),
    detail: [who, where].filter(Boolean).join(" · ").slice(0, 200),
    year: yearIn(csl.issued) ?? yearIn(csl.published) ?? yearIn(csl["published-online"]) ?? yearIn(csl["published-print"]),
  };
}

// Where doi.org sends a request for a DOI's metadata: the agencies' own services. For a DOI whose
// agency has none, doi.org sends it on to whatever site the DOI's owner gave, and Thanos doesn't follow.
const AGENCIES = ["crossref.org", "crosscite.org", "datacite.org", "medra.org", "jalc.or.jp"];

/** What doi.org says of a DOI: null when there's no such DOI, undefined when it couldn't be asked just now. */
export async function lookUp(doi: string): Promise<Paper | null | undefined> {
  let url = `https://doi.org/${doi.split("/").map(encodeURIComponent).join("/")}`;
  try {
    for (let hop = 0; hop < 4; hop++) {
      const reply = await fetch(url, {
        headers: { Accept: "application/vnd.citationstyles.csl+json" },
        redirect: "manual",
        signal: AbortSignal.timeout(6000),
      });
      if (reply.status === 404) return null;
      if (reply.status >= 300 && reply.status < 400) {
        const next = new URL(reply.headers.get("location") ?? "", url);
        const known = AGENCIES.some((host) => next.hostname === host || next.hostname.endsWith(`.${host}`));
        if (next.protocol !== "https:" || !known) return undefined;
        url = next.toString();
        continue;
      }
      if (!reply.ok) return undefined;
      return paperOf(doi, (await reply.json()) as Record<string, unknown>);
    }
  } catch {
    // doi.org, or the agency, didn't answer, or answered with something that isn't metadata.
  }
  return undefined;
}
