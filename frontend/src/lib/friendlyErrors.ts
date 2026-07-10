type ApiErrorPayload = {
  message?: string;
};

const technicalPatterns = [
  /VITE_/i,
  /Request failed/i,
  /NetworkError/i,
  /Failed to fetch/i,
  /JWT/i,
  /Cognito/i,
  /token/i,
  /stack/i,
  /endpoint/i,
  /undefined/i,
  /null/i
];

export function toFriendlyApiError(status: number, payload: ApiErrorPayload = {}) {
  if (status === 400) return sanitizeMessage(payload.message) ?? "Thông tin chưa hợp lệ. Vui lòng kiểm tra lại.";
  if (status === 401) return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
  if (status === 403) return "Tài khoản của bạn chưa có quyền thực hiện thao tác này.";
  if (status === 404) return "Không tìm thấy dữ liệu phù hợp.";
  if (status === 409) return sanitizeMessage(payload.message) ?? "Dữ liệu đang có ràng buộc nên chưa thể thực hiện thao tác này.";
  if (status === 429) return "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.";
  if (status >= 500) return "Hệ thống đang bận. Vui lòng thử lại sau.";
  return sanitizeMessage(payload.message) ?? "Không thể hoàn tất yêu cầu. Vui lòng thử lại.";
}

export function toFriendlyNetworkError(error: unknown) {
  if (error instanceof Error && error.name === "AbortError") {
    return "Yêu cầu mất quá nhiều thời gian. Vui lòng thử lại.";
  }
  return "Không thể kết nối hệ thống. Vui lòng kiểm tra mạng và thử lại.";
}

export function toFriendlyMessage(error: unknown, fallback = "Không thể hoàn tất yêu cầu. Vui lòng thử lại.") {
  if (!(error instanceof Error)) return fallback;
  return sanitizeMessage(error.message) ?? fallback;
}

function sanitizeMessage(message?: string) {
  if (!message) return null;
  if (message.includes("Cần đăng nhập")) return "Vui lòng đăng nhập để tiếp tục.";
  if (message.includes("Cần quyền admin")) return "Tài khoản của bạn chưa được cấp quyền quản trị.";
  if (technicalPatterns.some((pattern) => pattern.test(message))) return null;
  return message;
}
