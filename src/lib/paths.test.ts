import assert from "node:assert/strict";
import { test } from "node:test";

import { safeNext } from "./paths.ts";

test("keeps a path on this site, with its query and fragment", () => {
  assert.equal(safeNext("/murray"), "/murray");
  assert.equal(safeNext("/join/abc?x=1#top"), "/join/abc?x=1#top");
  assert.equal(safeNext(undefined), "/");
  assert.equal(safeNext(""), "/");
});

test("never sends anyone to another site, however it's dressed up", () => {
  for (const sneaky of ["//evil.example", "/\t/evil.example", "/\n/evil.example", "/\\evil.example", "https://evil.example", "javascript:alert(1)", "\\\\evil.example"]) {
    assert.equal(safeNext(sneaky).startsWith("//"), false, sneaky);
    assert.equal(new URL(safeNext(sneaky), "https://thanos.example").host, "thanos.example", sneaky);
  }
});
