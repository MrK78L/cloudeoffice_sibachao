import { apiRequest } from "../../../lib/apiClient";
import type { Office } from "../../offices";
import type { RentalRequest } from "../../rental-requests";

export type AdminStats = {
  offices: number;
  pendingRentalRequests: number;
  activeContracts: number;
  customers: number;
};

export type Contract = {
  id: string;
  officeId: string;
  customerId: string;
  rentalRequestId?: string;
  title?: string;
  status: "DRAFT" | "PENDING_SIGNATURE" | "ACTIVE" | "EXPIRED" | "TERMINATED";
  startDate?: string;
  endDate?: string;
  monthlyPrice?: number;
  fileKey?: string;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
};

export type Customer = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  status: "ACTIVE" | "INACTIVE";
  createdAt?: string;
  updatedAt?: string;
};

export type OfficePayload = {
  title: string;
  address: string;
  areaSqm: number;
  monthlyPrice: number;
  status: Office["status"];
  description?: string;
  imageUrl?: string;
  imageKey?: string;
  processedImageKey?: string;
  processedImageReady?: boolean;
  amenities?: string[];
};

export type OfficeImageUploadUrl = {
  bucket: string;
  key: string;
  uploadUrl: string;
  expiresIn: number;
};

export type RentalRequestPayload = {
  officeId: string;
  customerName: string;
  email: string;
  phone?: string;
  message?: string;
};

export type ContractPayload = {
  officeId: string;
  customerId: string;
  rentalRequestId?: string;
  title?: string;
  status: Contract["status"];
  startDate?: string;
  endDate?: string;
  monthlyPrice?: number;
  fileKey?: string;
};

export type CustomerPayload = {
  name: string;
  email: string;
  phone?: string;
  status: Customer["status"];
};

export async function getAdminStats() {
  return apiRequest<{ item: AdminStats }>("/admin/stats", { auth: true });
}

export async function getAdminOffices() {
  return apiRequest<{ items: Office[]; count: number }>("/admin/offices", { auth: true });
}

export async function getAdminRentalRequests() {
  return apiRequest<{ items: RentalRequest[]; count: number }>("/admin/rental-requests", { auth: true });
}

export async function getAdminContracts() {
  return apiRequest<{ items: Contract[]; count: number }>("/admin/contracts", { auth: true });
}

export async function getAdminCustomers() {
  return apiRequest<{ items: Customer[]; count: number }>("/admin/customers", { auth: true });
}

export async function createAdminOffice(payload: OfficePayload) {
  return apiRequest<{ item: Office }>("/admin/offices", { method: "POST", body: payload, auth: true });
}

export async function updateAdminOffice(id: string, payload: Partial<OfficePayload>) {
  return apiRequest<{ item: Office }>(`/admin/offices/${encodeURIComponent(id)}`, { method: "PATCH", body: payload, auth: true });
}

export async function deleteAdminOffice(id: string) {
  return apiRequest<{ item: Office }>(`/admin/offices/${encodeURIComponent(id)}`, { method: "DELETE", auth: true });
}

export async function createAdminOfficeImageUploadUrl(id: string, file: File) {
  return apiRequest<OfficeImageUploadUrl>(`/admin/offices/${encodeURIComponent(id)}/image-upload-url`, {
    method: "POST",
    body: {
      fileName: file.name,
      contentType: file.type || "image/jpeg"
    },
    auth: true
  });
}

export async function uploadOfficeImageToS3(uploadUrl: string, file: File) {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "image/jpeg"
    },
    body: file
  });

  if (!response.ok) {
    throw new Error("Không thể tải ảnh văn phòng lên hệ thống. Vui lòng thử lại.");
  }
}

export async function createAdminRentalRequest(payload: RentalRequestPayload) {
  return apiRequest<{ item: RentalRequest }>("/admin/rental-requests", { method: "POST", body: payload, auth: true });
}

export async function updateAdminRentalRequestStatus(id: string, payload: Pick<RentalRequest, "status"> & { decisionNote?: string }) {
  return apiRequest<{ item: RentalRequest }>(`/admin/rental-requests/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: payload,
    auth: true
  });
}

export async function deleteAdminRentalRequest(id: string) {
  return apiRequest<{ item: RentalRequest }>(`/admin/rental-requests/${encodeURIComponent(id)}`, { method: "DELETE", auth: true });
}

export async function createAdminContract(payload: ContractPayload) {
  return apiRequest<{ item: Contract }>("/admin/contracts", { method: "POST", body: payload, auth: true });
}

export async function updateAdminContract(id: string, payload: Partial<ContractPayload>) {
  return apiRequest<{ item: Contract }>(`/admin/contracts/${encodeURIComponent(id)}`, { method: "PATCH", body: payload, auth: true });
}

export async function deleteAdminContract(id: string) {
  return apiRequest<{ item: Contract }>(`/admin/contracts/${encodeURIComponent(id)}`, { method: "DELETE", auth: true });
}

export async function createAdminCustomer(payload: CustomerPayload) {
  return apiRequest<{ item: Customer }>("/admin/customers", { method: "POST", body: payload, auth: true });
}

export async function updateAdminCustomer(id: string, payload: Partial<Omit<CustomerPayload, "email">>) {
  return apiRequest<{ item: Customer }>(`/admin/customers/${encodeURIComponent(id)}`, { method: "PATCH", body: payload, auth: true });
}

export async function deleteAdminCustomer(id: string) {
  return apiRequest<{ item: Customer }>(`/admin/customers/${encodeURIComponent(id)}`, { method: "DELETE", auth: true });
}
