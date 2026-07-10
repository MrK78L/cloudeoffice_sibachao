import { apiRequest } from "../../../lib/apiClient";
import type { CreateRentalRequestInput, RentalRequest } from "../types";

export async function createRentalRequest(payload: CreateRentalRequestInput) {
  return apiRequest<{ item: RentalRequest }>("/rental-requests", {
    method: "POST",
    auth: true,
    body: payload
  });
}

export async function getRentalRequest(requestId: string) {
  return apiRequest<{ item: RentalRequest }>(`/rental-requests/${encodeURIComponent(requestId)}`, {
    auth: true
  });
}
