import assert from "node:assert/strict";
import { test } from "node:test";

import { findRepos, repoOf } from "./github.ts";
import { matchNames, nameKey, slugFor } from "./names.ts";
import { doiOf, findDois, paperOf, readDois } from "./papers.ts";
import { labYears, readYear, span } from "./timeline.ts";

// Everything here is made up: no lab's names, repositories or papers.

test("a DOI is read however it's pasted, and anything else isn't one", () => {
  assert.equal(doiOf("10.1234/ABC.5678"), "10.1234/abc.5678");
  assert.equal(doiOf("https://doi.org/10.1234/abc.5678"), "10.1234/abc.5678");
  assert.equal(doiOf("doi: 10.1234/abc.5678."), "10.1234/abc.5678");
  assert.equal(doiOf("https://dx.doi.org/10.1234%2Fabc"), "10.1234/abc");
  assert.equal(doiOf("not a doi"), null);
  // A long run of punctuation is read once, not once for every place it could end.
  const started = Date.now();
  assert.deepEqual(readDois(`${".".repeat(200_000)}x`).dois, []);
  assert.ok(Date.now() - started < 500);
  assert.deepEqual(readDois("10.1234/one\nhttps://doi.org/10.1234/two, 10.1234/one\nnope"), {
    dois: ["10.1234/one", "10.1234/two"],
    wrong: ["nope"],
  });
  assert.deepEqual(findDois("our preprint (doi:10.1101/2020.01.02.123456). See also 10.1234/xyz."), [
    "10.1101/2020.01.02.123456",
    "10.1234/xyz",
  ]);
});

test("a paper takes its title, authors, venue and year from doi.org's answer", () => {
  const paper = paperOf("10.1234/abc", {
    title: "Where <i>memory</i> lives",
    author: [{ family: "Rivera" }, { family: "Okafor" }, { family: "Lindqvist" }],
    "container-title": "Journal of Made-Up Results",
    issued: { "date-parts": [[2021, 6, 2]] },
  });
  assert.deepEqual(paper, { doi: "10.1234/abc", title: "Where memory lives", detail: "Rivera et al. · Journal of Made-Up Results", year: 2021 });
  const preprint = paperOf("10.1101/x", {
    title: "A preprint",
    author: [{ family: "Rivera" }],
    "container-title": [],
    institution: [{ name: "bioRxiv" }],
    issued: { "date-parts": [[2020]] },
  });
  assert.equal(preprint.detail, "Rivera · bioRxiv");
});

test("a repository is read from owner/name or a link, and GitHub's own pages aren't repositories", () => {
  assert.equal(repoOf("examplelab/memory-task"), "examplelab/memory-task");
  assert.equal(repoOf("https://github.com/examplelab/memory-task.git"), "examplelab/memory-task");
  assert.equal(repoOf("github.com/examplelab/memory-task/tree/main/analysis"), "examplelab/memory-task");
  assert.equal(repoOf("https://github.com/orgs/examplelab/repositories"), null);
  assert.equal(repoOf("just words"), null);
  assert.deepEqual(findRepos("code is at https://github.com/examplelab/task-code. and github.com/someone/fork.git"), [
    "examplelab/task-code",
    "someone/fork",
  ]);
});

test("a project's address comes from its name", () => {
  assert.equal(slugFor("Pilot at 3T"), "pilot-at-3t");
  assert.equal(slugFor("Visual_search (second try)"), "visual-search-second-try");
  assert.equal(slugFor("!!!"), "project");
  assert.equal(nameKey("Visual_Search"), nameKey("visual search"));
});

test("names from the chat meet the lab's people by full name, or by a first name only one has", () => {
  const people = [
    { id: "a", name: "Ada Rivera" },
    { id: "b", name: "Ben Okafor" },
    { id: "c", name: "Ben Lindqvist" },
    { id: "d", name: "Noor" },
  ];
  assert.deepEqual(matchNames(["Ada Rivera", "Ada", "Ben", "Noor Haddad", "Ada Smith", "Someone New"], people), {
    ids: ["a", "d"],
    others: ["Ben", "Ada Smith", "Someone New"],
  });
});

test("years read from a form, and a project's years read back", () => {
  const now = new Date("2026-11-04T00:00:00Z");
  assert.equal(readYear("", now), null);
  assert.equal(readYear("2019", now), 2019);
  assert.equal(readYear("2027", now), undefined);
  assert.equal(readYear("2026", now), 2026);
  assert.equal(readYear("19", now), undefined);
  assert.equal(span(2018, 2021, "done"), "2018–2021");
  assert.equal(span(2023, null, "active"), "Since 2023");
  assert.equal(span(2023, null, "done"), "Started 2023");
  assert.equal(span(null, null, "active"), "");
});

test("history puts each thing in its year, newest year first, and leaves out what has no year", () => {
  const years = labYears(
    [
      { id: "a", name: "Ada", title: "", joinedAt: "2019-09-01T00:00:00Z", leftAt: "2024-06-01T00:00:00Z" },
      { id: "b", name: "Ben", title: "", joinedAt: "2024-01-15T00:00:00Z", leftAt: null },
    ],
    [
      { slug: "one", name: "One", status: "published", started: 2019, ended: 2022 },
      { slug: "two", name: "Two", status: "active", started: 2024, ended: null },
      { slug: "three", name: "Three", status: "paused", started: null, ended: 2023 },
    ],
    [{ doi: "10.1234/x", title: "A paper", detail: "", year: 2022, project: { slug: "one", name: "One" } }],
    2026,
  );
  assert.deepEqual(
    years.map((y) => y.year),
    [2026, 2024, 2022, 2019],
  );
  const y2024 = years.find((y) => y.year === 2024)!;
  assert.deepEqual([y2024.started.map((p) => p.slug), y2024.joined.map((p) => p.id), y2024.left.map((p) => p.id)], [["two"], ["b"], ["a"]]);
  assert.deepEqual(years.find((y) => y.year === 2022)!.finished.map((p) => p.slug), ["one"]);
  assert.equal(years[0].began, true);
});
