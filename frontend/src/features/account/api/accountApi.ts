import { apiRequest } from "../../../lib/apiClient";
import type { Contract } from "../../admin/api/adminApi";
import type { RentalRequest } from "../../rental-requests";

export type UserProfile = {
  id: string;
  sub: string;
  email: string;
  displayName?: string;
  phone?: string;
  avatarDataUrl?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type UpdateUserProfileInput = {
  displayName?: string;
  phone?: string;
  avatarDataUrl?: string;
};

export async function getMyRentalRequests() {
  return apiRequest<{ items: RentalRequest[]; count: number }>("/me/rental-requests", { auth: true });
}

export async function getMyContracts() {
  return apiRequest<{ items: Contract[]; count: number }>("/me/contracts", { auth: true });
}

export async function getMyProfile() {
  return apiRequest<{ item: UserProfile }>("/me/profile", { auth: true });
}

export async function updateMyProfile(payload: UpdateUserProfileInput) {
  return apiRequest<{ item: UserProfile }>("/me/profile", { method: "PATCH", body: payload, auth: true });
}
