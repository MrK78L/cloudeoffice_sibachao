import { translate } from "../i18n";

const sessionKey = "orms.auth.session";
export const authSessionChangedEvent = "orms:auth-session-changed";
let refreshAccessTokenPromise: Promise<string> | null = null;

type CognitoTokenResponse = {
  AccessToken: string;
  IdToken?: string;
  RefreshToken?: string;
  ExpiresIn?: number;
};

type CognitoApiError = {
  __type?: string;
  message?: string;
};

export type AuthSession = {
  accessToken: string;
  idToken?: string;
  refreshToken?: string;
  expiresAt?: number;
};

export type AuthUser = {
  sub?: string;
  email?: string;
  name?: string;
  picture?: string;
  groups: string[];
};

export type SignInInput = {
  email: string;
  password: string;
};

export type SignUpInput = {
  email: string;
  password: string;
  name?: string;
};

export type ConfirmSignUpInput = {
  email: string;
  code: string;
};

export type ConfirmForgotPasswordInput = {
  email: string;
  code: string;
  password: string;
};

export class NewPasswordRequiredError extends Error {
  constructor(public readonly challengeSession: string) {
    super(translate("Bạn cần đặt mật khẩu mới để hoàn tất đăng nhập.", "You need to set a new password to complete sign-in."));
    this.name = "NewPasswordRequiredError";
  }
}

const cognitoConfig = {
  userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID ?? "",
  clientId: import.meta.env.VITE_COGNITO_CLIENT_ID ?? ""
};

export function getAuthSession(): AuthSession | null {
  const session = readStoredAuthSession();
  if (!session) return null;
  if (session.expiresAt && session.expiresAt <= Date.now() && !session.refreshToken) {
    sessionStorage.removeItem(sessionKey);
    return null;
  }
  return session;
}

function readStoredAuthSession(): AuthSession | null {
  const raw = sessionStorage.getItem(sessionKey);
  if (!raw) return null;

  try {
    const session = JSON.parse(raw) as AuthSession;
    return session.accessToken ? session : null;
  } catch {
    return null;
  }
}

export function getAccessToken() {
  return getAuthSession()?.accessToken ?? null;
}

export function saveAuthSession(session: AuthSession) {
  sessionStorage.setItem(sessionKey, JSON.stringify(session));
  notifyAuthSessionChanged();
}

export function logout() {
  sessionStorage.removeItem(sessionKey);
  notifyAuthSessionChanged();
}

export async function getValidAccessToken() {
  const session = readStoredAuthSession();
  if (!session) return null;
  if (!session.expiresAt || session.expiresAt > Date.now() + 60_000) return session.accessToken;
  if (!session.refreshToken) {
    logout();
    return null;
  }

  if (refreshAccessTokenPromise) return await refreshAccessTokenPromise;
  refreshAccessTokenPromise = refreshAccessToken(session).finally(() => {
    refreshAccessTokenPromise = null;
  });
  return await refreshAccessTokenPromise;
}

export async function getValidApiToken() {
  await getValidAccessToken();
  const session = readStoredAuthSession();
  return session?.idToken ?? session?.accessToken ?? null;
}

async function refreshAccessToken(session: AuthSession) {
  try {
    const response = await callCognito<{ AuthenticationResult?: CognitoTokenResponse }>("InitiateAuth", {
      AuthFlow: "REFRESH_TOKEN_AUTH",
      ClientId: requireClientId(),
      AuthParameters: { REFRESH_TOKEN: session.refreshToken }
    });
    if (!response.AuthenticationResult?.AccessToken) throw new Error("Missing refreshed access token");
    const refreshed = createAuthSession(response.AuthenticationResult, session.refreshToken);
    saveAuthSession(refreshed);
    return refreshed.accessToken;
  } catch {
    logout();
    throw new Error(translate("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", "Your session has expired. Please sign in again."));
  }
}

export function getUserFromSession(session: AuthSession | null): AuthUser | null {
  if (!session) return null;

  const payload = decodeJwtPayload(session.idToken ?? session.accessToken);
  if (!payload) return null;

  const groups = payload["cognito:groups"];
  return {
    sub: typeof payload.sub === "string" ? payload.sub : undefined,
    email: typeof payload.email === "string" ? payload.email : undefined,
    name: typeof payload.name === "string" ? payload.name : undefined,
    picture: typeof payload.picture === "string" ? payload.picture : undefined,
    groups: Array.isArray(groups) ? groups.filter((group): group is string => typeof group === "string") : []
  };
}

export async function signInWithEmailPassword(input: SignInInput): Promise<AuthSession> {
  const response = await callCognito<{
    AuthenticationResult?: CognitoTokenResponse;
    ChallengeName?: string;
    Session?: string;
  }>("InitiateAuth", {
    AuthFlow: "USER_PASSWORD_AUTH",
    ClientId: requireClientId(),
    AuthParameters: {
      USERNAME: input.email.trim().toLowerCase(),
      PASSWORD: input.password
    }
  });

  if (response.ChallengeName === "NEW_PASSWORD_REQUIRED" && response.Session) {
    throw new NewPasswordRequiredError(response.Session);
  }
  if (!response.AuthenticationResult?.AccessToken) {
    throw new Error(translate("Không thể đăng nhập lúc này. Vui lòng thử lại.", "Unable to sign in right now. Please try again."));
  }

  const session = createAuthSession(response.AuthenticationResult);
  saveAuthSession(session);
  return session;
}

export async function completeNewPasswordChallenge(email: string, password: string, challengeSession: string) {
  const response = await callCognito<{ AuthenticationResult?: CognitoTokenResponse }>("RespondToAuthChallenge", {
    ChallengeName: "NEW_PASSWORD_REQUIRED",
    ClientId: requireClientId(),
    Session: challengeSession,
    ChallengeResponses: {
      USERNAME: email.trim().toLowerCase(),
      NEW_PASSWORD: password
    }
  });
  if (!response.AuthenticationResult?.AccessToken) {
    throw new Error(translate("Không thể hoàn tất thay đổi mật khẩu. Vui lòng thử lại.", "Unable to complete the password change. Please try again."));
  }

  const session = createAuthSession(response.AuthenticationResult);
  saveAuthSession(session);
  return session;
}

function createAuthSession(tokens: CognitoTokenResponse, existingRefreshToken?: string): AuthSession {
  return {
    accessToken: tokens.AccessToken,
    idToken: tokens.IdToken,
    refreshToken: tokens.RefreshToken ?? existingRefreshToken,
    expiresAt: tokens.ExpiresIn ? Date.now() + tokens.ExpiresIn * 1000 : undefined
  };
}

function notifyAuthSessionChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(authSessionChangedEvent));
}

export async function signUpWithEmailPassword(input: SignUpInput) {
  return callCognito("SignUp", {
    ClientId: requireClientId(),
    Username: input.email.trim().toLowerCase(),
    Password: input.password,
    UserAttributes: [
      { Name: "email", Value: input.email.trim().toLowerCase() },
      ...(input.name?.trim() ? [{ Name: "name", Value: input.name.trim() }] : [])
    ]
  });
}

export async function confirmSignUp(input: ConfirmSignUpInput) {
  return callCognito("ConfirmSignUp", {
    ClientId: requireClientId(),
    Username: input.email.trim().toLowerCase(),
    ConfirmationCode: input.code.trim()
  });
}

export async function requestPasswordReset(email: string) {
  return callCognito("ForgotPassword", {
    ClientId: requireClientId(),
    Username: email.trim().toLowerCase()
  });
}

export async function confirmPasswordReset(input: ConfirmForgotPasswordInput) {
  return callCognito("ConfirmForgotPassword", {
    ClientId: requireClientId(),
    Username: input.email.trim().toLowerCase(),
    ConfirmationCode: input.code.trim(),
    Password: input.password
  });
}

export async function changePassword(previousPassword: string, proposedPassword: string) {
  const session = getAuthSession();
  if (!session?.accessToken) {
    throw new Error(translate("Vui lòng đăng nhập để tiếp tục.", "Please sign in to continue."));
  }

  return callCognito("ChangePassword", {
    AccessToken: session.accessToken,
    PreviousPassword: previousPassword,
    ProposedPassword: proposedPassword
  });
}

async function callCognito<T>(action: string, body: unknown): Promise<T> {
  const region = getRegion();
  let response: Response;

  try {
    response = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-amz-json-1.1",
        "X-Amz-Target": `AWSCognitoIdentityProviderService.${action}`
      },
      body: JSON.stringify(body)
    });
  } catch {
    throw new Error(translate("Không thể kết nối hệ thống đăng nhập. Vui lòng kiểm tra mạng và thử lại.", "Unable to connect to the sign-in service. Check your network and try again."));
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(toFriendlyAuthError(payload as CognitoApiError));
  }

  return payload as T;
}

function requireClientId() {
  if (!cognitoConfig.clientId) {
    throw new Error(translate("Hệ thống đăng nhập chưa sẵn sàng. Vui lòng thử lại sau.", "The sign-in service is not ready. Please try again later."));
  }
  return cognitoConfig.clientId;
}

function getRegion() {
  const region = cognitoConfig.userPoolId.split("_")[0];
  if (!region) {
    throw new Error(translate("Hệ thống đăng nhập chưa sẵn sàng. Vui lòng thử lại sau.", "The sign-in service is not ready. Please try again later."));
  }
  return region;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const [, payload] = token.split(".");
  if (!payload) return null;

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(normalized)
        .split("")
        .map((char) => `%${`00${char.charCodeAt(0).toString(16)}`.slice(-2)}`)
        .join("")
    );
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function toFriendlyAuthError(error: CognitoApiError) {
  const type = error.__type?.split("#").pop() ?? "";
  if (type === "NotAuthorizedException") return translate("Email hoặc mật khẩu không đúng.", "Incorrect email or password.");
  if (type === "UserNotConfirmedException") return translate("Tài khoản chưa xác thực email. Vui lòng nhập mã xác nhận.", "Your email has not been verified. Please enter the verification code.");
  if (type === "UsernameExistsException") return translate("Email này đã được đăng ký.", "This email is already registered.");
  if (type === "CodeMismatchException") return translate("Mã xác nhận không đúng.", "The verification code is incorrect.");
  if (type === "ExpiredCodeException") return translate("Mã xác nhận đã hết hạn.", "The verification code has expired.");
  if (type === "InvalidPasswordException") return translate("Mật khẩu cần tối thiểu 8 ký tự, có chữ hoa, chữ thường và số.", "The password must contain at least 8 characters, including uppercase, lowercase and a number.");
  if (type === "UserNotFoundException") return translate("Không tìm thấy tài khoản với email này.", "No account was found for this email.");
  if (type === "LimitExceededException") return translate("Bạn thao tác quá nhiều lần. Vui lòng thử lại sau.", "Too many attempts. Please try again later.");
  return translate("Không thể xử lý yêu cầu đăng nhập. Vui lòng thử lại.", "Unable to process the sign-in request. Please try again.");
}
