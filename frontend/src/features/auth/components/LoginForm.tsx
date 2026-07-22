import { FormEvent, useState } from "react";
import { navigate } from "../../../app/router";
import { toFriendlyMessage } from "../../../lib/friendlyErrors";
import {
  completeNewPasswordChallenge,
  confirmPasswordReset,
  confirmSignUp,
  NewPasswordRequiredError,
  requestPasswordReset,
  signInWithEmailPassword,
  signUpWithEmailPassword
} from "../cognito";
import { useAuth } from "../hooks/useAuth";
import { useLanguage } from "../../i18n";

type LoginFormProps = {
  reason?: string;
};

type AuthMode = "login" | "register" | "confirm" | "forgot" | "reset" | "new-password";

export function LoginForm({ reason }: LoginFormProps) {
  const { loginWithSession } = useAuth();
  const { tr } = useLanguage();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [challengeSession, setChallengeSession] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setIsSubmitting(true);

    try {
      if (mode === "login") {
        const session = await signInWithEmailPassword({ email, password });
        loginWithSession(session);
        navigate("/");
        return;
      }

      if (mode === "new-password") {
        validatePasswordMatch();
        if (!challengeSession) throw new Error(tr("Phiên đổi mật khẩu không còn hợp lệ. Vui lòng đăng nhập lại.", "Your password setup session has expired. Please sign in again."));
        const session = await completeNewPasswordChallenge(email, password, challengeSession);
        loginWithSession(session);
        navigate("/");
        return;
      }

      if (mode === "register") {
        validatePasswordMatch();
        await signUpWithEmailPassword({ email, password, name });
        setSuccess(tr("Đăng ký thành công. Vui lòng kiểm tra email và nhập mã xác nhận.", "Registration successful. Check your email and enter the verification code."));
        setMode("confirm");
        return;
      }

      if (mode === "confirm") {
        await confirmSignUp({ email, code });
        setSuccess(tr("Tài khoản đã được xác nhận. Bạn có thể đăng nhập.", "Your account has been verified. You can now sign in."));
        setMode("login");
        return;
      }

      if (mode === "forgot") {
        await requestPasswordReset(email);
        setSuccess(tr("Mã đặt lại mật khẩu đã được gửi về email.", "A password reset code has been sent to your email."));
        setMode("reset");
        return;
      }

      if (mode === "reset") {
        validatePasswordMatch();
        await confirmPasswordReset({ email, code, password });
        setSuccess(tr("Mật khẩu đã được cập nhật. Bạn có thể đăng nhập.", "Your password has been updated. You can now sign in."));
        setMode("login");
      }
    } catch (caught) {
      if (caught instanceof NewPasswordRequiredError) {
        setChallengeSession(caught.challengeSession);
        setPassword("");
        setConfirmPassword("");
        setSuccess(tr("Đây là lần đăng nhập đầu tiên. Vui lòng tạo mật khẩu mới.", "This is your first sign-in. Please create a new password."));
        setMode("new-password");
        return;
      }
      setError(toFriendlyMessage(caught, tr("Không thể xử lý yêu cầu. Vui lòng thử lại.", "We could not process your request. Please try again.")));
    } finally {
      setIsSubmitting(false);
    }
  }

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError("");
    setSuccess("");
    setCode("");
    setConfirmPassword("");
    if (nextMode !== "new-password") setChallengeSession("");
  }

  function validatePasswordMatch() {
    if (password !== confirmPassword) {
      throw new Error(tr("Mật khẩu nhập lại không khớp.", "The passwords do not match."));
    }
  }

  const title = {
    login: tr("Đăng nhập", "Sign in"),
    register: tr("Tạo tài khoản", "Create account"),
    confirm: tr("Xác nhận email", "Verify email"),
    forgot: tr("Quên mật khẩu", "Forgot password"),
    reset: tr("Đặt lại mật khẩu", "Reset password"),
    "new-password": tr("Tạo mật khẩu mới", "Create new password")
  }[mode];

  const description = {
    login: tr("Đăng nhập để gửi yêu cầu thuê, theo dõi hồ sơ và quản lý hợp đồng của bạn.", "Sign in to submit leasing requests, track records and manage your contracts."),
    register: tr("Tạo tài khoản khách hàng để lưu thông tin và nhận cập nhật về yêu cầu thuê.", "Create a customer account to save your details and receive leasing updates."),
    confirm: tr("Nhập mã xác nhận đã được gửi về email để kích hoạt tài khoản.", "Enter the verification code sent to your email to activate your account."),
    forgot: tr("Nhập email tài khoản để nhận mã đặt lại mật khẩu.", "Enter your account email to receive a password reset code."),
    reset: tr("Nhập mã xác nhận và mật khẩu mới để hoàn tất khôi phục.", "Enter the verification code and a new password to complete recovery."),
    "new-password": tr("Tạo mật khẩu mới cho lần đăng nhập đầu tiên để tiếp tục sử dụng tài khoản.", "Create a new password for your first sign-in to continue.")
  }[mode];

  return (
    <form className="auth-form login-card" onSubmit={handleSubmit}>
      <div className="login-intro">
        <p className="eyebrow">{tr("Tài khoản khách hàng", "Customer account")}</p>
        <h1>{tr("Quản lý nhu cầu thuê văn phòng của bạn", "Manage your office leasing needs")}</h1>
        <p>{tr("Đăng nhập để lưu yêu cầu thuê, theo dõi trạng thái xử lý và nhận thông tin hợp đồng trong một nơi duy nhất.", "Sign in to save leasing requests, track progress and access contract information in one place.")}</p>
        <div className="login-benefits" aria-label={tr("Lợi ích tài khoản", "Account benefits")}>
          <span>{tr("Theo dõi yêu cầu thuê", "Track leasing requests")}</span>
          <span>{tr("Quản lý hợp đồng", "Manage contracts")}</span>
          <span>{tr("Bảo vệ thông tin cá nhân", "Protect personal information")}</span>
        </div>
      </div>

      <div className="login-fields">
        <div>
          <p className="eyebrow">{tr("Tài khoản", "Account")}</p>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>

        <div className="auth-tabs" aria-label={tr("Chọn chức năng tài khoản", "Choose account action")}>
          <button className={mode === "login" || mode === "new-password" ? "active" : ""} onClick={() => changeMode("login")} type="button">
            {tr("Đăng nhập", "Sign in")}
          </button>
          <button className={mode === "register" || mode === "confirm" ? "active" : ""} onClick={() => changeMode("register")} type="button">
            {tr("Đăng ký", "Register")}
          </button>
          <button className={mode === "forgot" || mode === "reset" ? "active" : ""} onClick={() => changeMode("forgot")} type="button">
            {tr("Quên mật khẩu", "Forgot password")}
          </button>
        </div>

        {reason && <div className="notice">{reason}</div>}
        {success && <div className="notice success">{success}</div>}
        {error && <div className="notice danger">{error}</div>}

        {mode === "register" && (
          <label>
            {tr("Họ và tên", "Full name")}
            <input
              autoComplete="name"
              onChange={(event) => setName(event.target.value)}
              placeholder={tr("Nguyễn Văn A", "Alex Nguyen")}
              value={name}
            />
          </label>
        )}

        <label>
          Email
          <input
            autoComplete="email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@company.com"
            required
            type="email"
            value={email}
          />
        </label>

        {(mode === "login" || mode === "register" || mode === "reset" || mode === "new-password") && (
          <label>
            {tr("Mật khẩu", "Password")}
            <input
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={tr("Tối thiểu 8 ký tự", "At least 8 characters")}
              required
              type="password"
              value={password}
            />
          </label>
        )}

        {(mode === "register" || mode === "reset" || mode === "new-password") && (
          <label>
            {tr("Nhập lại mật khẩu", "Confirm password")}
            <input
              autoComplete="new-password"
              minLength={8}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder={tr("Nhập lại mật khẩu", "Enter password again")}
              required
              type="password"
              value={confirmPassword}
            />
          </label>
        )}

        {(mode === "confirm" || mode === "reset") && (
          <label>
            {tr("Mã xác nhận", "Verification code")}
            <input
              inputMode="numeric"
              onChange={(event) => setCode(event.target.value)}
              placeholder={tr("Nhập mã trong email", "Enter the code from your email")}
              required
              value={code}
            />
          </label>
        )}

        <div className="auth-actions">
          <button disabled={isSubmitting} type="submit">
            {isSubmitting ? tr("Đang xử lý...", "Processing...") : title}
          </button>
          {mode === "confirm" && (
            <button className="ghost-button" onClick={() => changeMode("register")} type="button">
              {tr("Đổi email", "Change email")}
            </button>
          )}
          {mode === "reset" && (
            <button className="ghost-button" onClick={() => changeMode("forgot")} type="button">
              {tr("Gửi lại mã", "Resend code")}
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
