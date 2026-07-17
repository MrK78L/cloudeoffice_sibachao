import { createHash } from "node:crypto";

const rentalRequestTransitions = {
  PENDING: new Set(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]),
  APPROVED: new Set(["APPROVED"]),
  REJECTED: new Set(["REJECTED"]),
  CANCELLED: new Set(["CANCELLED"])
};

export function canTransitionRentalRequest(currentStatus, nextStatus) {
  return Boolean(rentalRequestTransitions[currentStatus]?.has(nextStatus));
}

export function contractEndTimestamp(endDate) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return new Date(`${endDate}T23:59:59.999Z`).getTime();
  return new Date(endDate).getTime();
}

export function stableHash(value) {
  return createHash("sha256").update(String(value).trim().toLowerCase()).digest("hex").slice(0, 32);
}
