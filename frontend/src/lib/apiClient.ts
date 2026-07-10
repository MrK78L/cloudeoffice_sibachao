import { getAccessToken, logout } from "../features/auth/cognito";
import { toFriendlyApiError, toFriendlyNetworkError } from "./friendlyErrors";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

type ApiRequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  auth?: boolean;
};

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  if (!apiBaseUrl) {
    throw new Error("Hệ thống chưa sẵn sàng. Vui lòng thử lại sau.");
  }

  const token = options.auth ? getAccessToken() : undefined;
  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
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
