import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { changePassword } from "../features/auth/cognito";
import { useAuth } from "../features/auth";
import {
  confirmMyAvatar,
  createMyAvatarUploadUrl,
  getMyProfile,
  updateMyProfile,
  uploadMyAvatar,
  type UserProfile
} from "../features/account/api/accountApi";
import { toFriendlyMessage } from "../lib/friendlyErrors";

type ProfileForm = {
  displayName: string;
  phone: string;
};

type PasswordForm = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

const emptyPasswordForm: PasswordForm = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: ""
};

export function ProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [form, setForm] = useState<ProfileForm>({ displayName: "", phone: "" });
  const [passwordForm, setPasswordForm] = useState<PasswordForm>(emptyPasswordForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const avatar = profile?.avatarUrl || profile?.avatarDataUrl || user?.picture || "";
  const fallbackInitial = (form.displayName || profile?.email || user?.email || "U").trim().charAt(0).toUpperCase();

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);

    getMyProfile()
      .then((response) => {
        if (!active) return;
        setProfile(response.item);
        setForm({
          displayName: response.item.displayName || user?.name || "",
          phone: response.item.phone || ""
        });
      })
      .catch((caught) => {
        if (active) setError(toFriendlyMessage(caught, "Không thể tải hồ sơ. Vui lòng thử lại."));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user?.name, user?.picture]);

  const handleAvatarChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    setSuccess(null);
    setIsUploadingAvatar(true);

    try {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        throw new Error("Ảnh đại diện phải có định dạng JPG, PNG hoặc WebP.");
      }
      if (file.size > 2 * 1024 * 1024) throw new Error("Ảnh đại diện không được vượt quá 2 MB.");
      const upload = await createMyAvatarUploadUrl(file);
      await uploadMyAvatar(upload.uploadUrl, file);
      const response = await confirmMyAvatar(upload.key);
      setProfile(response.item);
      setSuccess("Đã cập nhật ảnh đại diện.");
      window.dispatchEvent(new Event("orms-profile-updated"));
    } catch (caught) {
      setError(toFriendlyMessage(caught, "Không thể xử lý ảnh. Vui lòng chọn ảnh khác."));
    } finally {
      setIsUploadingAvatar(false);
      event.target.value = "";
    }
  };

  const handleProfileSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSavingProfile(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await updateMyProfile({
        displayName: form.displayName.trim(),
        phone: form.phone.trim()
      });
      setProfile(response.item);
      setSuccess("Đã cập nhật hồ sơ cá nhân.");
      window.dispatchEvent(new Event("orms-profile-updated"));
    } catch (caught) {
      setError(toFriendlyMessage(caught));
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handlePasswordSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSavingPassword(true);
    setError(null);
    setSuccess(null);

    try {
      if (passwordForm.newPassword !== passwordForm.confirmPassword) {
        throw new Error("Mật khẩu mới chưa khớp.");
      }
      await changePassword(passwordForm.currentPassword, passwordForm.newPassword);
      setPasswordForm(emptyPasswordForm);
      setSuccess("Đã đổi mật khẩu thành công.");
    } catch (caught) {
      setError(toFriendlyMessage(caught));
    } finally {
      setIsSavingPassword(false);
    }
  };

  return (
    <main className="app-shell profile-page">
      <div className="profile-heading">
        <p className="eyebrow">Tài khoản</p>
        <h1>Hồ sơ cá nhân</h1>
        <p className="muted">Quản lý thông tin hiển thị, ảnh đại diện và mật khẩu đăng nhập.</p>
      </div>

      {error && <div className="notice danger">{error}</div>}
      {success && <div className="notice success">{success}</div>}

      <section className="profile-grid">
        <form className="profile-card" onSubmit={(event) => void handleProfileSubmit(event)}>
          <div className="profile-avatar-editor">
            <div className="profile-avatar-preview" aria-hidden="true">
              {avatar ? <img alt="" src={avatar} /> : <span>{fallbackInitial}</span>}
            </div>
            <div>
              <strong>{profile?.email || user?.email || "Tài khoản"}</strong>
              <label className="avatar-upload">
                {isUploadingAvatar ? "Đang tải ảnh..." : "Chọn ảnh"}
                <input accept="image/png,image/jpeg,image/webp" disabled={isUploadingAvatar} onChange={(event) => void handleAvatarChange(event)} type="file" />
              </label>
              <p className="muted">JPG, PNG hoặc WebP, tối đa 2 MB. Ảnh được lưu riêng tư trên S3.</p>
            </div>
          </div>

          <div className="form-grid">
            <label>
              Họ tên hiển thị
              <input disabled={isLoading} value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} />
            </label>
            <label>
              Số điện thoại
              <input disabled={isLoading} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
            </label>
          </div>

          <div className="admin-form-actions">
            <button disabled={isSavingProfile || isLoading} type="submit">Lưu hồ sơ</button>
          </div>
        </form>

        <form className="profile-card" onSubmit={(event) => void handlePasswordSubmit(event)}>
          <div className="profile-card-title">
            <h2>Đổi mật khẩu</h2>
            <p className="muted">Sử dụng mật khẩu mạnh để bảo vệ tài khoản.</p>
          </div>
          <div className="form-grid single-column">
            <label>
              Mật khẩu hiện tại
              <input autoComplete="current-password" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm({ ...passwordForm, currentPassword: event.target.value })} required type="password" />
            </label>
            <label>
              Mật khẩu mới
              <input autoComplete="new-password" value={passwordForm.newPassword} onChange={(event) => setPasswordForm({ ...passwordForm, newPassword: event.target.value })} required type="password" />
            </label>
            <label>
              Nhập lại mật khẩu mới
              <input autoComplete="new-password" value={passwordForm.confirmPassword} onChange={(event) => setPasswordForm({ ...passwordForm, confirmPassword: event.target.value })} required type="password" />
            </label>
          </div>
          <div className="admin-form-actions">
            <button disabled={isSavingPassword} type="submit">Đổi mật khẩu</button>
          </div>
        </form>
      </section>
    </main>
  );
}
