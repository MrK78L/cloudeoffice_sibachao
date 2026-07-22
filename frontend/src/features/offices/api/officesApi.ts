import { apiRequest } from "../../../lib/apiClient";
import type { Office, OfficeSearchParams } from "../types";

export const fallbackOffices: Office[] = [
  {
    id: "demo-1",
    title: "Văn phòng trung tâm Quận 1",
    address: "Nguyễn Huệ, Quận 1, TP.HCM",
    areaSqm: 86,
    monthlyPrice: 42000000,
    status: "AVAILABLE",
    description: "Không gian phù hợp đội 20-30 người, gần metro và khu tài chính."
  },
  {
    id: "demo-2",
    title: "Không gian làm việc Thủ Đức",
    address: "Xa lộ Hà Nội, TP. Thủ Đức",
    areaSqm: 130,
    monthlyPrice: 56000000,
    status: "RESERVED",
    description: "Mặt bằng sáng, có chỗ đậu xe, phù hợp công ty công nghệ."
  }
];

export async function getOffices(params: OfficeSearchParams = {}) {
  const searchParams = new URLSearchParams();
  if (params.q) searchParams.set("q", params.q);
  if (params.status) searchParams.set("status", params.status);
  if (params.nextToken) searchParams.set("nextToken", params.nextToken);
  if (params.limit) searchParams.set("limit", String(params.limit));
  const query = searchParams.toString() ? `?${searchParams.toString()}` : "";
  return apiRequest<{ items: Office[]; nextToken?: string }>(`/offices${query}`);
}

export async function getOffice(id: string) {
  return apiRequest<{ item: Office }>(`/offices/${encodeURIComponent(id)}`);
}
