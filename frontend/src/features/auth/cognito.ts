const sessionKey = "orms.auth.session";

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

const cognitoConfig = {
  userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID ?? "",
  clientId: import.meta.env.VITE_COGNITO_CLIENT_ID ?? ""
};

export function getAuthSession(): AuthSession | null {
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
}

export function logout() {
  sessionStorage.removeItem(sessionKey);
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
  }>("InitiateAuth", {
    AuthFlow: "USER_PASSWORD_AUTH",
    ClientId: requireClientId(),
    AuthParameters: {
      USERNAME: input.email.trim().toLowerCase(),
      PASSWORD: input.password
    }
  });

  if (!response.AuthenticationResult?.AccessToken) {
    throw new Error(response.ChallengeName
      ? "Tài khoản cần thêm một bước xác thực. Vui lòng liên hệ quản trị viên."
      : "Không thể đăng nhập lúc này. Vui lòng thử lại.");
  }

  const session: AuthSession = {
    accessToken: response.AuthenticationResult.AccessToken,
    idToken: response.AuthenticationResult.IdToken,
    refreshToken: response.AuthenticationResult.RefreshToken,
    expiresAt: response.AuthenticationResult.ExpiresIn
      ? Date.now() + response.AuthenticationResult.ExpiresIn * 1000
      : undefined
  };

  saveAuthSession(session);
  return session;
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
    throw new Error("Vui lòng đăng nhập để tiếp tục.");
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
    throw new Error("Không thể kết nối hệ thống đăng nhập. Vui lòng kiểm tra mạng và thử lại.");
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(toFriendlyAuthError(payload as CognitoApiError));
  }

  return payload as T;
}

function requireClientId() {
  if (!cognitoConfig.clientId) {
    throw new Error("Hệ thống đăng nhập chưa sẵn sàng. Vui lòng thử lại sau.");
  }
  return cognitoConfig.clientId;
}

function getRegion() {
  const region = cognitoConfig.userPoolId.split("_")[0];
  if (!region) {
    throw new Error("Hệ thống đăng nhập chưa sẵn sàng. Vui lòng thử lại sau.");
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
  if (type === "NotAuthorizedException") return "Email hoặc mật khẩu không đúng.";
  if (type === "UserNotConfirmedException") return "Tài khoản chưa xác thực email. Vui lòng nhập mã xác nhận.";
  if (type === "UsernameExistsException") return "Email này đã được đăng ký.";
  if (type === "CodeMismatchException") return "Mã xác nhận không đúng.";
  if (type === "ExpiredCodeException") return "Mã xác nhận đã hết hạn.";
  if (type === "InvalidPasswordException") return "Mật khẩu cần tối thiểu 8 ký tự, có chữ hoa, chữ thường và số.";
  if (type === "UserNotFoundException") return "Không tìm thấy tài khoản với email này.";
  if (type === "LimitExceededException") return "Bạn thao tác quá nhiều lần. Vui lòng thử lại sau.";
  return "Không thể xử lý yêu cầu đăng nhập. Vui lòng thử lại.";
}
