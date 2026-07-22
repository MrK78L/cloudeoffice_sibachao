import type { Language } from "../../features/i18n";

export function formatCurrency(value: number, language: Language = "vi") {
  return new Intl.NumberFormat(language === "vi" ? "vi-VN" : "en-US", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0
  }).format(value);
}

export function formatDate(value: string, language: Language = "vi") {
  return new Intl.DateTimeFormat(language === "vi" ? "vi-VN" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function formatDateOnly(value: string, language: Language = "vi") {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return new Intl.DateTimeFormat(language === "vi" ? "vi-VN" : "en-US", {
    dateStyle: "medium"
  }).format(date);
}

const statusLabels: Record<string, Record<Language, string>> = {
  AVAILABLE: { vi: "Đang trống", en: "Available" },
  RESERVED: { vi: "Đang giữ chỗ", en: "Reserved" },
  LEASED: { vi: "Đã thuê", en: "Leased" },
  INACTIVE: { vi: "Tạm ngừng", en: "Inactive" },
  PENDING: { vi: "Chờ xử lý", en: "Pending" },
  APPROVED: { vi: "Đã duyệt", en: "Approved" },
  REJECTED: { vi: "Từ chối", en: "Rejected" },
  CANCELLED: { vi: "Đã hủy", en: "Cancelled" },
  DRAFT: { vi: "Bản nháp", en: "Draft" },
  PENDING_SIGNATURE: { vi: "Chờ ký", en: "Pending signature" },
  ACTIVE: { vi: "Đang hiệu lực", en: "Active" },
  EXPIRED: { vi: "Đã hết hạn", en: "Expired" },
  TERMINATED: { vi: "Đã kết thúc", en: "Terminated" },
  REQUESTED: { vi: "Chờ xác nhận", en: "Requested" },
  CONFIRMED: { vi: "Đã xác nhận", en: "Confirmed" },
  COMPLETED: { vi: "Đã hoàn thành", en: "Completed" }
};

export function formatStatus(value: string, language: Language = "vi") {
  return statusLabels[value]?.[language] ?? value;
}

const generatedContractTitle = /^(hợp đồng|contract)\s+[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function formatContractTitle(title: string | undefined, language: Language = "vi") {
  if (!title || generatedContractTitle.test(title.trim())) {
    return language === "vi" ? "Hợp đồng thuê văn phòng" : "Office lease";
  }
  return title;
}
