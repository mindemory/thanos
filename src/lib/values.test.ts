import assert from "node:assert/strict";
import { test } from "node:test";

import { findValues } from "./values.ts";

test("finds chart strings, but not dates, phone numbers or grant numbers", () => {
  assert.deepEqual(findValues("Charge scans to 10-1234-56789-123456-00, not the old one."), ["10-1234-56789-123456-00"]);
  assert.deepEqual(findValues("Since 2026-11-01, call 603-555-0100."), []);
  assert.deepEqual(findValues("It's R01 MH123456, fund 1234-56789-0123."), []);
  assert.deepEqual(findValues("Rate it 1-2-3-4."), []);
});

test("finds paths without the punctuation after them", () => {
  assert.deepEqual(findValues("Raw data is in /lab/raw/2026 and ~/projects/eyes."), ["/lab/raw/2026", "~/projects/eyes"]);
  assert.deepEqual(findValues("Drafts go to (~/.thanos/imports/demo-drafts.jsonl)."), ["~/.thanos/imports/demo-drafts.jsonl"]);
});

test("leaves slashes in ordinary writing alone", () => {
  assert.deepEqual(findValues("Ask the PI and/or the lab manager, w/ the receipt, 24/7."), []);
  assert.deepEqual(findValues("Open /demo in Thanos, or github.com/demolab/tools."), []);
});

test("finds the addresses of shared drives", () => {
  assert.deepEqual(findValues("Mount smb://files.example.edu/demolab first."), ["smb://files.example.edu/demolab"]);
  assert.deepEqual(findValues(String.raw`On Windows it's \\files.example.edu\demolab\raw today.`), [
    String.raw`\\files.example.edu\demolab\raw`,
  ]);
});
