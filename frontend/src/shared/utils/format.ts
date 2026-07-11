export function formatCurrency(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0
  }).format(value);
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

const statusLabels: Record<string, string> = {
  AVAILABLE: "Đang trống",
  RESERVED: "Đang giữ chỗ",
  LEASED: "Đã thuê",
  INACTIVE: "Tạm ngừng",
  PENDING: "Chờ xử lý",
  APPROVED: "Đã duyệt",
  REJECTED: "Từ chối",
  CANCELLED: "Đã hủy",
  DRAFT: "Bản nháp",
  PENDING_SIGNATURE: "Chờ ký",
  ACTIVE: "Đang hiệu lực",
  EXPIRED: "Đã hết hạn",
  TERMINATED: "Đã kết thúc",
  REQUESTED: "Chờ xác nhận",
  CONFIRMED: "Đã xác nhận",
  COMPLETED: "Đã hoàn thành"
};

export function formatStatus(value: string) {
  return statusLabels[value] ?? value;
}
