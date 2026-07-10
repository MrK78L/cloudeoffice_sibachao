import { FormEvent, useState } from "react";
import { navigate } from "../../../app/router";
import { toFriendlyMessage } from "../../../lib/friendlyErrors";
import {
  confirmPasswordReset,
  confirmSignUp,
  requestPasswordReset,
  signInWithEmailPassword,
  signUpWithEmailPassword
} from "../cognito";
import { useAuth } from "../hooks/useAuth";

type LoginFormProps = {
  reason?: string;
};

type AuthMode = "login" | "register" | "confirm" | "forgot" | "reset";

export function LoginForm({ reason }: LoginFormProps) {
  const { loginWithSession } = useAuth();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
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

      if (mode === "register") {
        validatePasswordMatch();
        await signUpWithEmailPassword({ email, password, name });
        setSuccess("Đăng ký thành công. Vui lòng kiểm tra email và nhập mã xác nhận.");
        setMode("confirm");
        return;
      }

      if (mode === "confirm") {
        await confirmSignUp({ email, code });
        setSuccess("Tài khoản đã được xác nhận. Bạn có thể đăng nhập.");
        setMode("login");
        return;
      }

      if (mode === "forgot") {
        await requestPasswordReset(email);
        setSuccess("Mã đặt lại mật khẩu đã được gửi về email.");
        setMode("reset");
        return;
      }

      if (mode === "reset") {
        validatePasswordMatch();
        await confirmPasswordReset({ email, code, password });
        setSuccess("Mật khẩu đã được cập nhật. Bạn có thể đăng nhập.");
        setMode("login");
      }
    } catch (caught) {
      setError(toFriendlyMessage(caught, "Không thể xử lý yêu cầu. Vui lòng thử lại."));
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
  }

  function validatePasswordMatch() {
    if (password !== confirmPassword) {
      throw new Error("Mật khẩu nhập lại không khớp.");
    }
  }

  const title = {
    login: "Đăng nhập",
    register: "Tạo tài khoản",
    confirm: "Xác nhận email",
    forgot: "Quên mật khẩu",
    reset: "Đặt lại mật khẩu"
  }[mode];

  const description = {
    login: "Đăng nhập để gửi yêu cầu thuê, theo dõi hồ sơ và quản lý hợp đồng của bạn.",
    register: "Tạo tài khoản khách hàng để lưu thông tin và nhận cập nhật về yêu cầu thuê.",
    confirm: "Nhập mã xác nhận đã được gửi về email để kích hoạt tài khoản.",
    forgot: "Nhập email tài khoản để nhận mã đặt lại mật khẩu.",
    reset: "Nhập mã xác nhận và mật khẩu mới để hoàn tất khôi phục."
  }[mode];

  return (
    <form className="auth-form login-card" onSubmit={handleSubmit}>
      <div className="login-intro">
        <p className="eyebrow">Tài khoản khách hàng</p>
        <h1>Quản lý nhu cầu thuê văn phòng của bạn</h1>
        <p>Đăng nhập để lưu yêu cầu thuê, theo dõi trạng thái xử lý và nhận thông tin hợp đồng trong một nơi duy nhất.</p>
        <div className="login-benefits" aria-label="Lợi ích tài khoản">
          <span>Theo dõi yêu cầu thuê</span>
          <span>Quản lý hợp đồng</span>
          <span>Bảo vệ thông tin cá nhân</span>
        </div>
      </div>

      <div className="login-fields">
        <div>
          <p className="eyebrow">Tài khoản</p>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>

        <div className="auth-tabs" aria-label="Chọn chức năng tài khoản">
          <button className={mode === "login" ? "active" : ""} onClick={() => changeMode("login")} type="button">
            Đăng nhập
          </button>
          <button className={mode === "register" || mode === "confirm" ? "active" : ""} onClick={() => changeMode("register")} type="button">
            Đăng ký
          </button>
          <button className={mode === "forgot" || mode === "reset" ? "active" : ""} onClick={() => changeMode("forgot")} type="button">
            Quên mật khẩu
          </button>
        </div>

        {reason && <div className="notice">{reason}</div>}
        {success && <div className="notice success">{success}</div>}
        {error && <div className="notice danger">{error}</div>}

        {mode === "register" && (
          <label>
            Họ và tên
            <input
              autoComplete="name"
              onChange={(event) => setName(event.target.value)}
              placeholder="Nguyễn Văn A"
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

        {(mode === "login" || mode === "register" || mode === "reset") && (
          <label>
            Mật khẩu
            <input
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Tối thiểu 8 ký tự"
              required
              type="password"
              value={password}
            />
          </label>
        )}

        {(mode === "register" || mode === "reset") && (
          <label>
            Nhập lại mật khẩu
            <input
              autoComplete="new-password"
              minLength={8}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Nhập lại mật khẩu"
              required
              type="password"
              value={confirmPassword}
            />
          </label>
        )}

        {(mode === "confirm" || mode === "reset") && (
          <label>
            Mã xác nhận
            <input
              inputMode="numeric"
              onChange={(event) => setCode(event.target.value)}
              placeholder="Nhập mã trong email"
              required
              value={code}
            />
          </label>
        )}

        <div className="auth-actions">
          <button disabled={isSubmitting} type="submit">
            {isSubmitting ? "Đang xử lý..." : title}
          </button>
          {mode === "confirm" && (
            <button className="ghost-button" onClick={() => changeMode("register")} type="button">
              Đổi email
            </button>
          )}
          {mode === "reset" && (
            <button className="ghost-button" onClick={() => changeMode("forgot")} type="button">
              Gửi lại mã
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
