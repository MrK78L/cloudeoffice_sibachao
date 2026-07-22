import { getValidApiToken, logout } from "../features/auth/cognito";
import { toFriendlyApiError, toFriendlyNetworkError } from "./friendlyErrors";
import { translate } from "../features/i18n";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

type ApiRequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  auth?: boolean;
};

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  if (!apiBaseUrl) {
    throw new Error(translate("Hệ thống chưa sẵn sàng. Vui lòng thử lại sau.", "The service is not ready. Please try again later."));
  }

  const token = options.auth ? await getValidApiToken() : undefined;
  let response: Response;

  try {
    response = await fetchWithTimeout(`${apiBaseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
  } catch (error) {
    throw new Error(toFriendlyNetworkError(error));
  }

  const payload = await response.json().catch(() => ({}));

  if (response.status === 401) {
    logout();
  }

  if (!response.ok) {
    throw new Error(toFriendlyApiError(response.status, payload));
  }

  return payload as T;
}

export async function apiDownload(path: string, fileName: string) {
  const token = await getValidApiToken();
  let response: Response;
  try {
    response = await fetchWithTimeout(`${apiBaseUrl}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
  } catch (error) {
    throw new Error(toFriendlyNetworkError(error));
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(toFriendlyApiError(response.status, payload));
  }
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 25_000);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}
