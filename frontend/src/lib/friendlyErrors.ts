import { getCurrentLanguage } from "../features/i18n";

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
  if (getCurrentLanguage() === "en") {
    if (status === 400) return "The information provided is invalid. Please review it and try again.";
    if (status === 401) return "Your session has expired. Please sign in again.";
    if (status === 403) return "Your account does not have permission to perform this action.";
    if (status === 404) return "The requested information could not be found.";
    if (status === 409) return "This action conflicts with related or recently updated data.";
    if (status === 429) return "Too many requests. Please wait a few minutes and try again.";
    if (status >= 500) return "The service is temporarily unavailable. Please try again later.";
    return "Unable to complete your request. Please try again.";
  }
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
  const english = getCurrentLanguage() === "en";
  if (error instanceof Error && error.name === "AbortError") {
    return english ? "The request took too long. Please try again." : "Yêu cầu mất quá nhiều thời gian. Vui lòng thử lại.";
  }
  return english ? "Unable to connect to the service. Check your network and try again." : "Không thể kết nối hệ thống. Vui lòng kiểm tra mạng và thử lại.";
}

export function toFriendlyMessage(
  error: unknown,
  fallback = getCurrentLanguage() === "en" ? "Unable to complete your request. Please try again." : "Không thể hoàn tất yêu cầu. Vui lòng thử lại."
) {
  if (!(error instanceof Error)) return fallback;
  return sanitizeMessage(error.message) ?? fallback;
}

function sanitizeMessage(message?: string) {
  if (!message) return null;
  const english = getCurrentLanguage() === "en";
  if (message.includes("Cần đăng nhập")) return english ? "Please sign in to continue." : "Vui lòng đăng nhập để tiếp tục.";
  if (message.includes("Cần quyền admin")) return english ? "Your account does not have administrator access." : "Tài khoản của bạn chưa được cấp quyền quản trị.";
  if (english && /[ăâđêôơưĂÂĐÊÔƠƯáàảãạéèẻẽẹíìỉĩịóòỏõọúùủũụýỳỷỹỵ]/i.test(message)) return null;
  if (technicalPatterns.some((pattern) => pattern.test(message))) return null;
  return message;
}
