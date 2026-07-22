import { createHash } from "node:crypto";

const rentalRequestTransitions = {
  PENDING: new Set(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]),
  APPROVED: new Set(["APPROVED"]),
  REJECTED: new Set(["REJECTED"]),
  CANCELLED: new Set(["CANCELLED"])
};

const appointmentStatuses = ["REQUESTED", "CONFIRMED", "COMPLETED", "REJECTED", "CANCELLED"];
const adminAppointmentTransitions = {
  REQUESTED: new Set(["REQUESTED", "CONFIRMED", "REJECTED", "CANCELLED"]),
  CONFIRMED: new Set(["CONFIRMED", "COMPLETED", "CANCELLED"]),
  COMPLETED: new Set(["COMPLETED"]),
  REJECTED: new Set(["REJECTED"]),
  CANCELLED: new Set(["CANCELLED"])
};
const contractTransitions = {
  DRAFT: new Set(["DRAFT", "PENDING_SIGNATURE", "ACTIVE", "TERMINATED"]),
  PENDING_SIGNATURE: new Set(["PENDING_SIGNATURE", "ACTIVE", "TERMINATED"]),
  ACTIVE: new Set(["ACTIVE", "EXPIRED", "TERMINATED"]),
  EXPIRED: new Set(["EXPIRED", "ACTIVE"]),
  TERMINATED: new Set(["TERMINATED", "ACTIVE"])
};

export const contractRenewalWindowMs = 3 * 24 * 60 * 60 * 1000;
export const contractRenewalRequestWindowMs = 30 * 24 * 60 * 60 * 1000;
export const appointmentDurationMs = 30 * 60 * 1000;

export function canTransitionRentalRequest(currentStatus, nextStatus) {
  return Boolean(rentalRequestTransitions[currentStatus]?.has(nextStatus));
}

export function canTransitionAppointment(currentStatus, nextStatus, admin = false) {
  if (!appointmentStatuses.includes(currentStatus) || !appointmentStatuses.includes(nextStatus)) return false;
  if (admin) return Boolean(adminAppointmentTransitions[currentStatus]?.has(nextStatus));
  return ["REQUESTED", "CONFIRMED"].includes(currentStatus) && nextStatus === "CANCELLED";
}

export function canTransitionContract(currentStatus, nextStatus) {
  return Boolean(contractTransitions[currentStatus]?.has(nextStatus));
}

export function contractEndTimestamp(endDate) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return new Date(`${endDate}T23:59:59.999Z`).getTime();
  return new Date(endDate).getTime();
}

export function contractRenewalDeadline(endedAt) {
  const endedTimestamp = new Date(endedAt).getTime();
  return Number.isFinite(endedTimestamp)
    ? new Date(endedTimestamp + contractRenewalWindowMs).toISOString()
    : "";
}

export function intervalsOverlap(startA, endA, startB, endB) {
  const values = [startA, endA, startB, endB].map((value) => new Date(value).getTime());
  if (values.some((value) => !Number.isFinite(value))) return false;
  return values[0] < values[3] && values[2] < values[1];
}

export function appointmentOverlapsContract(scheduledAt, contractStart, contractEnd) {
  const appointmentStart = new Date(scheduledAt).getTime();
  if (!Number.isFinite(appointmentStart)) return false;
  return intervalsOverlap(
    appointmentStart,
    appointmentStart + appointmentDurationMs,
    new Date(contractStart).getTime(),
    contractEndTimestamp(contractEnd)
  );
}

export function canRequestContractRenewal(contract, now = Date.now()) {
  if (!contract || !contract.endDate) return false;
  if (contract.status === "ACTIVE") {
    const end = contractEndTimestamp(contract.endDate);
    return Number.isFinite(end) && end >= now && end - now <= contractRenewalRequestWindowMs;
  }
  if (!["EXPIRED", "TERMINATED"].includes(contract.status)) return false;
  const deadline = new Date(contract.renewalDeadline ?? "").getTime();
  return Number.isFinite(deadline) && deadline >= now;
}

export function stableHash(value) {
  return createHash("sha256").update(String(value).trim().toLowerCase()).digest("hex").slice(0, 32);
}

export function claimValues(value) {
  if (Array.isArray(value)) return value.flatMap(claimValues);
  if (typeof value !== "string") return [];

  const text = value.trim();
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    if (parsed !== text) return claimValues(parsed);
  } catch {
    // API Gateway can serialize array claims as [admin] instead of valid JSON.
  }

  const unwrapped = text.startsWith("[") && text.endsWith("]")
    ? text.slice(1, -1)
    : text;

  return unwrapped
    .split(",")
    .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}
