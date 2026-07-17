import { apiDownload, apiRequest } from "../../../lib/apiClient";
import type { Appointment } from "../../appointments";
import type { Office } from "../../offices";
import type { RentalRequest } from "../../rental-requests";
import {
  createPreviewContract,
  createPreviewCustomer,
  createPreviewOffice,
  createPreviewRentalRequest,
  deletePreviewContract,
  deletePreviewCustomer,
  deletePreviewOffice,
  deletePreviewRentalRequest,
  getPreviewContracts,
  getPreviewCustomers,
  getPreviewAppointments,
  getPreviewOffices,
  getPreviewRentalRequests,
  getPreviewStats,
  isAdminPreviewMode,
  updatePreviewContract,
  updatePreviewCustomer,
  updatePreviewOffice,
  updatePreviewRentalRequest,
  updatePreviewAppointment,
  uploadPreviewOfficeImage
} from "./adminPreviewStore";

export type AdminStats = {
  offices: number;
  pendingRentalRequests: number;
  activeContracts: number;
  customers: number;
  pendingAppointments?: number;
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
  if (isAdminPreviewMode) return { item: getPreviewStats() };
  return apiRequest<{ item: AdminStats }>("/admin/stats", { auth: true });
}

export async function getAdminOffices() {
  if (isAdminPreviewMode) return { items: getPreviewOffices(), count: getPreviewOffices().length };
  return getAllAdminItems<Office>("/admin/offices");
}

export async function getAdminRentalRequests() {
  if (isAdminPreviewMode) return { items: getPreviewRentalRequests(), count: getPreviewRentalRequests().length };
  return getAllAdminItems<RentalRequest>("/admin/rental-requests");
}

export async function getAdminContracts() {
  if (isAdminPreviewMode) return { items: getPreviewContracts(), count: getPreviewContracts().length };
  return getAllAdminItems<Contract>("/admin/contracts");
}

export async function getAdminCustomers() {
  if (isAdminPreviewMode) return { items: getPreviewCustomers(), count: getPreviewCustomers().length };
  return getAllAdminItems<Customer>("/admin/customers");
}

export async function getAdminAppointments() {
  if (isAdminPreviewMode) return { items: getPreviewAppointments(), count: getPreviewAppointments().length };
  return getAllAdminItems<Appointment>("/admin/appointments");
}

async function getAllAdminItems<T>(path: string) {
  const items: T[] = [];
  let nextToken: string | undefined;
  let pageCount = 0;
  do {
    const query = new URLSearchParams({ limit: "200" });
    if (nextToken) query.set("nextToken", nextToken);
    const response = await apiRequest<{ items: T[]; nextToken?: string }>(`${path}?${query}`, { auth: true });
    items.push(...response.items);
    nextToken = response.nextToken;
    pageCount += 1;
  } while (nextToken && pageCount < 20);
  return { items, count: items.length, nextToken };
}

export async function updateAdminAppointment(id: string, payload: Pick<Appointment, "status"> & { adminNote?: string }) {
  if (isAdminPreviewMode) return { item: updatePreviewAppointment(id, payload) };
  return apiRequest<{ item: Appointment }>(`/admin/appointments/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: payload,
    auth: true
  });
}

export async function downloadAdminReport(type: "offices" | "customers" | "revenue") {
  if (isAdminPreviewMode) {
    const rows = type === "offices"
      ? getPreviewOffices()
      : type === "customers"
        ? getPreviewCustomers()
        : getPreviewContracts().map((item) => ({
            contractId: item.id,
            officeId: item.officeId,
            customerId: item.customerId,
            status: item.status,
            monthlyPrice: item.monthlyPrice ?? 0
          }));
    const headers = Object.keys(rows[0] ?? { message: "Không có dữ liệu" });
    const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const csv = [headers.map(escape).join(","), ...rows.map((row) => headers.map((key) => escape((row as Record<string, unknown>)[key])).join(","))].join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `cloffice-${type}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    return;
  }
  return apiDownload(`/admin/reports/${type}.csv`, `cloffice-${type}.csv`);
}

export async function createAdminOffice(payload: OfficePayload) {
  if (isAdminPreviewMode) return { item: createPreviewOffice(payload) };
  return apiRequest<{ item: Office }>("/admin/offices", { method: "POST", body: payload, auth: true });
}

export async function updateAdminOffice(id: string, payload: Partial<OfficePayload>) {
  if (isAdminPreviewMode) return { item: updatePreviewOffice(id, payload) };
  return apiRequest<{ item: Office }>(`/admin/offices/${encodeURIComponent(id)}`, { method: "PATCH", body: payload, auth: true });
}

export async function deleteAdminOffice(id: string) {
  if (isAdminPreviewMode) return { item: deletePreviewOffice(id) };
  return apiRequest<{ item: Office }>(`/admin/offices/${encodeURIComponent(id)}`, { method: "DELETE", auth: true });
}

export async function createAdminOfficeImageUploadUrl(id: string, file: File) {
  if (isAdminPreviewMode) return { bucket: "browser-preview", key: `images/offices/${id}/${file.name}`, uploadUrl: `preview://${id}`, expiresIn: 3600 };
  return apiRequest<OfficeImageUploadUrl>(`/admin/offices/${encodeURIComponent(id)}/image-upload-url`, {
    method: "POST",
    body: {
      fileName: file.name,
      contentType: file.type || "image/jpeg",
      fileSize: file.size
    },
    auth: true
  });
}

export async function uploadOfficeImageToS3(uploadUrl: string, file: File) {
  if (isAdminPreviewMode && uploadUrl.startsWith("preview://")) {
    await uploadPreviewOfficeImage(uploadUrl.slice("preview://".length), file);
    return;
  }
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

export async function confirmAdminOfficeImage(id: string, key: string) {
  if (isAdminPreviewMode) {
    const item = getPreviewOffices().find((office) => office.id === id);
    if (!item) throw new Error("Không tìm thấy văn phòng.");
    return { item };
  }
  return apiRequest<{ item: Office }>(`/admin/offices/${encodeURIComponent(id)}/image`, {
    method: "POST",
    body: { key },
    auth: true
  });
}

export async function createAdminRentalRequest(payload: RentalRequestPayload) {
  if (isAdminPreviewMode) return { item: createPreviewRentalRequest(payload) };
  return apiRequest<{ item: RentalRequest }>("/admin/rental-requests", { method: "POST", body: payload, auth: true });
}

export async function updateAdminRentalRequestStatus(id: string, payload: Pick<RentalRequest, "status"> & { decisionNote?: string }) {
  if (isAdminPreviewMode) return { item: updatePreviewRentalRequest(id, payload) };
  return apiRequest<{ item: RentalRequest }>(`/admin/rental-requests/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: payload,
    auth: true
  });
}

export async function deleteAdminRentalRequest(id: string) {
  if (isAdminPreviewMode) return { item: deletePreviewRentalRequest(id) };
  return apiRequest<{ item: RentalRequest }>(`/admin/rental-requests/${encodeURIComponent(id)}`, { method: "DELETE", auth: true });
}

export async function createAdminContract(payload: ContractPayload) {
  if (isAdminPreviewMode) return { item: createPreviewContract(payload) };
  return apiRequest<{ item: Contract }>("/admin/contracts", { method: "POST", body: payload, auth: true });
}

export async function updateAdminContract(id: string, payload: Partial<ContractPayload>) {
  if (isAdminPreviewMode) return { item: updatePreviewContract(id, payload) };
  return apiRequest<{ item: Contract }>(`/admin/contracts/${encodeURIComponent(id)}`, { method: "PATCH", body: payload, auth: true });
}

export async function deleteAdminContract(id: string) {
  if (isAdminPreviewMode) return { item: deletePreviewContract(id) };
  return apiRequest<{ item: Contract }>(`/admin/contracts/${encodeURIComponent(id)}`, { method: "DELETE", auth: true });
}

export async function createAdminCustomer(payload: CustomerPayload) {
  if (isAdminPreviewMode) return { item: createPreviewCustomer(payload) };
  return apiRequest<{ item: Customer }>("/admin/customers", { method: "POST", body: payload, auth: true });
}

export async function updateAdminCustomer(id: string, payload: Partial<Omit<CustomerPayload, "email">>) {
  if (isAdminPreviewMode) return { item: updatePreviewCustomer(id, payload) };
  return apiRequest<{ item: Customer }>(`/admin/customers/${encodeURIComponent(id)}`, { method: "PATCH", body: payload, auth: true });
}

export async function deleteAdminCustomer(id: string) {
  if (isAdminPreviewMode) return { item: deletePreviewCustomer(id) };
  return apiRequest<{ item: Customer }>(`/admin/customers/${encodeURIComponent(id)}`, { method: "DELETE", auth: true });
}
