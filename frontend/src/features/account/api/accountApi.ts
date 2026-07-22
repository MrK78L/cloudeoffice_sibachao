import { apiRequest } from "../../../lib/apiClient";
import type { Contract } from "../../admin/api/adminApi";
import type { RentalRequest } from "../../rental-requests";
import { translate } from "../../i18n";

export type UserProfile = {
  id: string;
  sub: string;
  email: string;
  displayName?: string;
  phone?: string;
  avatarKey?: string;
  avatarUrl?: string;
  avatarDataUrl?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type UpdateUserProfileInput = {
  displayName?: string;
  phone?: string;
};

export type AvatarUploadUrl = { bucket: string; key: string; uploadUrl: string; expiresIn: number };

export async function getMyRentalRequests() {
  return apiRequest<{ items: RentalRequest[]; count: number }>("/me/rental-requests", { auth: true });
}

export async function getMyContracts() {
  return apiRequest<{ items: Contract[]; count: number }>("/me/contracts", { auth: true });
}

export async function createContractRenewalRequest(contractId: string, message?: string) {
  return apiRequest<{ item: RentalRequest }>(`/me/contracts/${encodeURIComponent(contractId)}/renewal-request`, {
    method: "POST",
    body: { message },
    auth: true
  });
}

export async function getMyProfile() {
  return apiRequest<{ item: UserProfile }>("/me/profile", { auth: true });
}

export async function updateMyProfile(payload: UpdateUserProfileInput) {
  return apiRequest<{ item: UserProfile }>("/me/profile", { method: "PATCH", body: payload, auth: true });
}

export async function createMyAvatarUploadUrl(file: File) {
  return apiRequest<AvatarUploadUrl>("/me/avatar-upload-url", {
    method: "POST",
    body: { fileName: file.name, contentType: file.type, fileSize: file.size },
    auth: true
  });
}

export async function uploadMyAvatar(uploadUrl: string, file: File) {
  const response = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
  if (!response.ok) throw new Error(translate("Không thể tải ảnh đại diện lên hệ thống.", "Unable to upload the profile picture."));
}

export async function confirmMyAvatar(key: string) {
  return apiRequest<{ item: UserProfile }>("/me/avatar", { method: "POST", body: { key }, auth: true });
}

export async function createContractFileUploadUrl(contractId: string, file: File) {
  return apiRequest<AvatarUploadUrl>(`/contracts/${encodeURIComponent(contractId)}/upload-url`, {
    method: "POST",
    body: { fileName: file.name, contentType: file.type, fileSize: file.size },
    auth: true
  });
}

export async function uploadContractFile(uploadUrl: string, file: File) {
  const response = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": "application/pdf" }, body: file });
  if (!response.ok) throw new Error(translate("Không thể tải hợp đồng lên hệ thống.", "Unable to upload the contract."));
}

export async function confirmContractFile(contractId: string, key: string) {
  return apiRequest<{ item: Contract }>(`/contracts/${encodeURIComponent(contractId)}/file`, {
    method: "POST",
    body: { key },
    auth: true
  });
}
