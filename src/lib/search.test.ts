import assert from "node:assert/strict";
import { test } from "node:test";

import { buildIndex, plain, search, stem, type Doc } from "./search.ts";

const card = (id: string, title: string, body = "", tags = "", open = false): Doc => ({
  id,
  kind: "card",
  title,
  body,
  tags,
  topic: "other",
  open,
  helped: 0,
  href: `/lab/c/${id}`,
  updatedAt: "2026-01-01T00:00:00Z",
});

const index = buildIndex([
  card("grant", "Which grant do we charge fMRI scan time to?", "", "scanning, chart string", true),
  card("booking", "How do I book scanner time, and how far ahead?", "", "booking, mri", true),
  card("participants", "How do we pay participants, and what paperwork does that need?", "", "participants, payment", true),
  card("card", "Who holds the lab card, and how do I ask for a purchase on it?", "Ask the lab manager.", "p-card"),
  card("travel", "How do I get reimbursed for conference travel?", "Keep every receipt.", "travel"),
  card("cluster", "How do I get on the cluster?", "Request an account through research computing.", "hpc"),
]);

test("forms of a word meet", () => {
  assert.equal(stem("scanning"), stem("scans"));
  assert.equal(stem("reimbursed"), stem("reimbursement"));
  assert.equal(stem("toolboxes"), stem("toolbox"));
});

test("a question in other words finds the card that answers it", () => {
  assert.equal(search(index, "who pays for MRI")[0]?.doc.id, "grant");
  assert.equal(search(index, "expense report for SfN trip")[0]?.doc.id, "travel");
  assert.equal(search(index, "buy something with the pcard")[0]?.doc.id, "card");
  assert.equal(search(index, "hpc access")[0]?.doc.id, "cluster");
});

test("half-typed words and small typos still match", () => {
  assert.equal(search(index, "reimb")[0]?.doc.id, "travel");
  assert.equal(search(index, "clustr")[0]?.doc.id, "cluster");
});

test("a query of only small words finds nothing rather than everything", () => {
  assert.deepEqual(search(index, "how do I"), []);
});

test("a snippet reads a table as words, without its pipes and rules", () => {
  assert.equal(plain("| Grant | Pays for |\n| --- | ---: |\n| R01 | `scans` |"), "Grant Pays for R01 scans");
});
