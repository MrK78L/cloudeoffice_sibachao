import assert from "node:assert/strict";
import test from "node:test";
import {
  canTransitionAppointment,
  canTransitionContract,
  canTransitionRentalRequest,
  appointmentOverlapsContract,
  canRequestContractRenewal,
  claimValues,
  contractEndTimestamp,
  contractRenewalDeadline,
  intervalsOverlap,
  stableHash
} from "../functions/business-logic/domain.mjs";
import { buildUpdateParts, resolveCustomerEmail } from "../functions/business-logic/app.mjs";

test("workflow transitions allow contract renewal and keep cancelled requests terminal", () => {
  assert.equal(canTransitionRentalRequest("PENDING", "APPROVED"), true);
  assert.equal(canTransitionRentalRequest("PENDING", "CANCELLED"), true);
  assert.equal(canTransitionRentalRequest("APPROVED", "PENDING"), false);
  assert.equal(canTransitionRentalRequest("CANCELLED", "PENDING"), false);
  assert.equal(canTransitionAppointment("COMPLETED", "CONFIRMED", true), false);
  assert.equal(canTransitionAppointment("CANCELLED", "REQUESTED", true), false);
  assert.equal(canTransitionAppointment("REQUESTED", "CONFIRMED", true), true);
  assert.equal(canTransitionAppointment("COMPLETED", "CANCELLED", false), false);
  assert.equal(canTransitionContract("TERMINATED", "DRAFT"), false);
  assert.equal(canTransitionContract("EXPIRED", "ACTIVE"), true);
  assert.equal(canTransitionContract("TERMINATED", "ACTIVE"), true);
  assert.equal(canTransitionContract("ACTIVE", "TERMINATED"), true);
});

test("contract renewal deadline is three days after termination", () => {
  assert.equal(contractRenewalDeadline("2026-07-22T10:00:00.000Z"), "2026-07-25T10:00:00.000Z");
  assert.equal(contractRenewalDeadline("invalid"), "");
});

test("date-only contract end remains valid through the end of the UTC day", () => {
  assert.equal(contractEndTimestamp("2026-07-17"), Date.parse("2026-07-17T23:59:59.999Z"));
});

test("contract and appointment intervals use half-open boundaries", () => {
  assert.equal(intervalsOverlap("2026-08-01T08:00:00Z", "2026-08-01T09:00:00Z", "2026-08-01T08:30:00Z", "2026-08-01T09:30:00Z"), true);
  assert.equal(intervalsOverlap("2026-08-01T08:00:00Z", "2026-08-01T09:00:00Z", "2026-08-01T09:00:00Z", "2026-08-01T09:30:00Z"), false);
  assert.equal(appointmentOverlapsContract("2026-08-01T08:30:00Z", "2026-08-01T08:00:00Z", "2026-08-01T10:00:00Z"), true);
  assert.equal(appointmentOverlapsContract("2026-08-01T10:00:00Z", "2026-08-01T08:00:00Z", "2026-08-01T10:00:00Z"), false);
});

test("customers can request renewal in the final 30 days or active grace period", () => {
  const now = Date.parse("2026-07-22T10:00:00Z");
  assert.equal(canRequestContractRenewal({ status: "ACTIVE", endDate: "2026-08-01T10:00:00Z" }, now), true);
  assert.equal(canRequestContractRenewal({ status: "ACTIVE", endDate: "2026-09-01T10:00:00Z" }, now), false);
  assert.equal(canRequestContractRenewal({ status: "TERMINATED", endDate: "2026-07-20T10:00:00Z", renewalDeadline: "2026-07-23T10:00:00Z" }, now), true);
  assert.equal(canRequestContractRenewal({ status: "TERMINATED", endDate: "2026-07-18T10:00:00Z", renewalDeadline: "2026-07-21T10:00:00Z" }, now), false);
});

test("stable hashes normalize identity casing and whitespace", () => {
  assert.equal(stableHash(" User@Example.com "), stableHash("user@example.com"));
  assert.equal(stableHash("user@example.com").length, 32);
});

test("customer operations trust Cognito email while admins may submit another customer email", () => {
  const customerRequest = { claims: { sub: "customer-sub", email: "Customer@Example.com" } };
  assert.equal(resolveCustomerEmail(customerRequest, "other@example.com"), "customer@example.com");
  assert.equal(resolveCustomerEmail(customerRequest, ""), "customer@example.com");

  const adminRequest = { claims: { sub: "admin-sub", email: "admin@example.com", "cognito:groups": ["admin"] } };
  assert.equal(resolveCustomerEmail(adminRequest, "Tenant@Example.com"), "tenant@example.com");
});

test("group claims support Cognito and API Gateway serialization formats", () => {
  assert.deepEqual(claimValues(["admin", "operator"]), ["admin", "operator"]);
  assert.deepEqual(claimValues('["admin","operator"]'), ["admin", "operator"]);
  assert.deepEqual(claimValues("[admin, operator]"), ["admin", "operator"]);
  assert.deepEqual(claimValues("admin,operator"), ["admin", "operator"]);
  assert.equal(claimValues("admin-operator").includes("admin"), false);
});

test("DynamoDB update expressions do not include unused status aliases", () => {
  const parts = buildUpdateParts({
    status: "APPROVED",
    decisionNote: "Reviewed",
    ignored: undefined
  });

  assert.equal(parts.expression, "SET #f0 = :v0, #f1 = :v1");
  assert.deepEqual(parts.names, { "#f0": "status", "#f1": "decisionNote" });
  assert.deepEqual(parts.values, { ":v0": "APPROVED", ":v1": "Reviewed" });
  assert.equal(parts.names["#status"], undefined);
});
