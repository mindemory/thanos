import assert from "node:assert/strict";
import { test } from "node:test";

import { findSensitive } from "./sensitive.ts";

test("finds card numbers written the ways cards are written", () => {
  assert.deepEqual(findSensitive("Use 4111 1111 1111 1111 for the order"), ["a card number"]);
  assert.deepEqual(findSensitive("card 4111-1111-1111-1111"), ["a card number"]);
  assert.deepEqual(findSensitive("Amex 3782 822463 10005"), ["a card number"]);
  assert.deepEqual(findSensitive("4111111111111111"), ["a card number"]);
});

test("leaves chart strings, grant numbers and dates alone", () => {
  assert.deepEqual(findSensitive("Chart string 10-1234-56789-123456-00"), []);
  assert.deepEqual(findSensitive("Charge it to R01 MH123456, fund 1234-56789-0123"), []);
  assert.deepEqual(findSensitive("Scans before 2026-11-01 went to the old grant"), []);
  assert.deepEqual(findSensitive("4111 1111 1111 1112 fails the Luhn check"), []);
});

test("finds passwords, keys and other secrets, but not talk about them", () => {
  assert.deepEqual(findSensitive("The scanner console password: hunter22"), ["a password"]);
  // Built here, so no token-shaped string sits in the repo for a secret scanner to stop a push over.
  assert.deepEqual(findSensitive(`token ghp_${"x".repeat(32)}`), ["an API key or token"]);
  assert.deepEqual(findSensitive("SSN 123-45-6789"), ["a Social Security number"]);
  assert.deepEqual(findSensitive("Ask Jane for the password; it's in the lab's 1Password vault."), []);
  assert.deepEqual(findSensitive("Account number: 000123456789"), ["a bank account number"]);
});
