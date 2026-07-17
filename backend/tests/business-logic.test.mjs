import assert from "node:assert/strict";
import test from "node:test";
import {
  canTransitionRentalRequest,
  contractEndTimestamp,
  stableHash
} from "../functions/business-logic/domain.mjs";

test("rental request transitions prevent reopening terminal states", () => {
  assert.equal(canTransitionRentalRequest("PENDING", "APPROVED"), true);
  assert.equal(canTransitionRentalRequest("PENDING", "CANCELLED"), true);
  assert.equal(canTransitionRentalRequest("APPROVED", "PENDING"), false);
  assert.equal(canTransitionRentalRequest("CANCELLED", "PENDING"), false);
});

test("date-only contract end remains valid through the end of the UTC day", () => {
  assert.equal(contractEndTimestamp("2026-07-17"), Date.parse("2026-07-17T23:59:59.999Z"));
});

test("stable hashes normalize identity casing and whitespace", () => {
  assert.equal(stableHash(" User@Example.com "), stableHash("user@example.com"));
  assert.equal(stableHash("user@example.com").length, 32);
});
