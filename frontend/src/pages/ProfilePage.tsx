import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { changePassword } from "../features/auth/cognito";
import { useAuth } from "../features/auth";
import {
  confirmMyAvatar,
  createMyAvatarUploadUrl,
  getMyContracts,
  getMyProfile,
  updateMyProfile,
  uploadMyAvatar,
  type UserProfile
} from "../features/account/api/accountApi";
import { cancelMyAppointment, getMyAppointments } from "../features/appointments/api/appointmentsApi";
import type { Appointment } from "../features/appointments";
import type { Contract } from "../features/admin/api/adminApi";
import { DataTable, type DataTableColumn } from "../features/admin/shared/components/DataTable";
import { toFriendlyMessage } from "../lib/friendlyErrors";
import { useLanguage } from "../features/i18n";
import { formatContractTitle, formatDate, formatDateOnly, formatStatus } from "../shared/utils/format";
import { navigate } from "../app/router";
import { getOffices } from "../features/offices/api/officesApi";
import type { Office } from "../features/offices";

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
  const { language, tr } = useLanguage();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
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
  const officeName = (officeId: string) => offices.find((office) => office.id === officeId)?.title ?? tr("Văn phòng không còn hoạt động", "Office no longer active");

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);

    Promise.all([getMyProfile(), getMyAppointments(), getMyContracts(), getOffices({ limit: 200 }).catch(() => ({ items: [] }))])
      .then(([profileResponse, appointmentsResponse, contractsResponse, officesResponse]) => {
        if (!active) return;
        setProfile(profileResponse.item);
        setAppointments([...appointmentsResponse.items].sort((left, right) => Date.parse(right.scheduledAt) - Date.parse(left.scheduledAt)));
        setContracts(contractsResponse.items);
        setOffices(officesResponse.items);
        setForm({
          displayName: profileResponse.item.displayName || user?.name || "",
          phone: profileResponse.item.phone || ""
        });
      })
      .catch((caught) => {
        if (active) setError(toFriendlyMessage(caught, tr("Không thể tải hồ sơ. Vui lòng thử lại.", "Unable to load your profile. Please try again.")));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [language, user?.name, user?.picture]);

  const handleCancelAppointment = async (appointment: Appointment) => {
    if (!window.confirm(tr("Bạn muốn hủy lịch xem văn phòng này?", "Cancel this office viewing appointment?"))) return;
    setError(null);
    setSuccess(null);
    try {
      const response = await cancelMyAppointment(appointment.id);
      setAppointments((items) => items.map((item) => item.id === appointment.id ? response.item : item));
      setSuccess(tr("Đã hủy lịch hẹn.", "Appointment cancelled."));
    } catch (caught) {
      setError(toFriendlyMessage(caught));
    }
  };

  const handleAvatarChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    setSuccess(null);
    setIsUploadingAvatar(true);

    try {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        throw new Error(tr("Ảnh đại diện phải có định dạng JPG, PNG hoặc WebP.", "Profile pictures must be JPG, PNG or WebP."));
      }
      if (file.size > 2 * 1024 * 1024) throw new Error(tr("Ảnh đại diện không được vượt quá 2 MB.", "Profile pictures cannot exceed 2 MB."));
      const upload = await createMyAvatarUploadUrl(file);
      await uploadMyAvatar(upload.uploadUrl, file);
      const response = await confirmMyAvatar(upload.key);
      setProfile(response.item);
      setSuccess(tr("Đã cập nhật ảnh đại diện.", "Profile picture updated."));
      window.dispatchEvent(new Event("orms-profile-updated"));
    } catch (caught) {
      setError(toFriendlyMessage(caught, tr("Không thể xử lý ảnh. Vui lòng chọn ảnh khác.", "Unable to process this image. Please choose another file.")));
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
      setSuccess(tr("Đã cập nhật hồ sơ cá nhân.", "Profile updated."));
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
        throw new Error(tr("Mật khẩu mới chưa khớp.", "The new passwords do not match."));
      }
      await changePassword(passwordForm.currentPassword, passwordForm.newPassword);
      setPasswordForm(emptyPasswordForm);
      setSuccess(tr("Đã đổi mật khẩu thành công.", "Password changed successfully."));
    } catch (caught) {
      setError(toFriendlyMessage(caught));
    } finally {
      setIsSavingPassword(false);
    }
  };

  const appointmentColumns: DataTableColumn<Appointment>[] = [
    { key: "office", header: tr("Văn phòng", "Office"), render: (row) => officeName(row.officeId) },
    { key: "time", header: tr("Thời gian", "Date and time"), render: (row) => formatDate(row.scheduledAt, language) },
    { key: "status", header: tr("Trạng thái", "Status"), render: (row) => <span className={`status status-${row.status.toLowerCase()}`}>{formatStatus(row.status, language)}</span> },
    {
      key: "action",
      header: tr("Thao tác", "Actions"),
      render: (row) => ["REQUESTED", "CONFIRMED"].includes(row.status)
        ? <button className="link-button" onClick={() => void handleCancelAppointment(row)} type="button">{tr("Hủy lịch", "Cancel")}</button>
        : "-"
    }
  ];

  const contractColumns: DataTableColumn<Contract>[] = [
    { key: "contract", header: tr("Hợp đồng", "Contract"), render: (row) => formatContractTitle(row.title, language) },
    { key: "office", header: tr("Văn phòng", "Office"), render: (row) => officeName(row.officeId) },
    { key: "endDate", header: tr("Ngày kết thúc", "End date"), render: (row) => row.endDate ? formatDateOnly(row.endDate, language) : "-" },
    { key: "status", header: tr("Trạng thái", "Status"), render: (row) => <span className={`status status-${row.status.toLowerCase()}`}>{formatStatus(row.status, language)}</span> }
  ];

  return (
    <main className="app-shell profile-page">
      <div className="profile-heading">
        <p className="eyebrow">{tr("Tài khoản", "Account")}</p>
        <h1>{tr("Hồ sơ cá nhân", "Profile")}</h1>
        <p className="muted">{tr("Quản lý thông tin hiển thị, ảnh đại diện và mật khẩu đăng nhập.", "Manage your display information, profile picture and sign-in password.")}</p>
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
              <strong>{profile?.email || user?.email || tr("Tài khoản", "Account")}</strong>
              <label className="avatar-upload">
                {isUploadingAvatar ? tr("Đang tải ảnh...", "Uploading...") : tr("Chọn ảnh", "Choose image")}
                <input accept="image/png,image/jpeg,image/webp" disabled={isUploadingAvatar} onChange={(event) => void handleAvatarChange(event)} type="file" />
              </label>
              <p className="muted">{tr("JPG, PNG hoặc WebP, tối đa 2 MB. Ảnh được lưu riêng tư trên S3.", "JPG, PNG or WebP, up to 2 MB. Images are stored privately in S3.")}</p>
            </div>
          </div>

          <div className="form-grid">
            <label>
              {tr("Họ tên hiển thị", "Display name")}
              <input disabled={isLoading} value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} />
            </label>
            <label>
              {tr("Số điện thoại", "Phone number")}
              <input disabled={isLoading} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
            </label>
          </div>

          <div className="admin-form-actions">
            <button disabled={isSavingProfile || isLoading} type="submit">{tr("Lưu hồ sơ", "Save profile")}</button>
          </div>
        </form>

        <form className="profile-card" onSubmit={(event) => void handlePasswordSubmit(event)}>
          <div className="profile-card-title">
            <h2>{tr("Đổi mật khẩu", "Change password")}</h2>
            <p className="muted">{tr("Sử dụng mật khẩu mạnh để bảo vệ tài khoản.", "Use a strong password to protect your account.")}</p>
          </div>
          <div className="form-grid single-column">
            <label>
              {tr("Mật khẩu hiện tại", "Current password")}
              <input autoComplete="current-password" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm({ ...passwordForm, currentPassword: event.target.value })} required type="password" />
            </label>
            <label>
              {tr("Mật khẩu mới", "New password")}
              <input autoComplete="new-password" value={passwordForm.newPassword} onChange={(event) => setPasswordForm({ ...passwordForm, newPassword: event.target.value })} required type="password" />
            </label>
            <label>
              {tr("Nhập lại mật khẩu mới", "Confirm new password")}
              <input autoComplete="new-password" value={passwordForm.confirmPassword} onChange={(event) => setPasswordForm({ ...passwordForm, confirmPassword: event.target.value })} required type="password" />
            </label>
          </div>
          <div className="admin-form-actions">
            <button disabled={isSavingPassword} type="submit">{tr("Đổi mật khẩu", "Change password")}</button>
          </div>
        </form>
      </section>

      <section className="profile-workspace">
        <div className="profile-workspace-heading">
          <div>
            <p className="eyebrow">{tr("Hoạt động", "Activity")}</p>
            <h2>{tr("Lịch hẹn và hợp đồng", "Appointments and contracts")}</h2>
          </div>
          <button className="profile-workspace-link" onClick={() => navigate("/my-contracts")} type="button">
            {tr("Xem trang hợp đồng", "Open contracts")}
          </button>
        </div>

        <div className="profile-workspace-section">
          <div>
            <h3>{tr("Lịch xem văn phòng", "Office appointments")}</h3>
            <p>{tr("Theo dõi lịch đã đặt và hủy lịch chưa hoàn tất khi cần.", "Track your bookings and cancel unfinished appointments when needed.")}</p>
          </div>
          <div className="profile-workspace-table">
            <DataTable
              columns={appointmentColumns}
              data={appointments}
              emptyDescription={tr("Bạn chưa đặt lịch xem văn phòng.", "You have no office viewing appointments.")}
              isLoading={isLoading}
              pageSize={5}
            />
          </div>
          <div className="profile-mobile-records">
            {isLoading && <div className="profile-mobile-loading"><span /><span /></div>}
            {appointments.map((appointment) => (
              <article key={appointment.id}>
                <div><strong>{officeName(appointment.officeId)}</strong><span>{formatDate(appointment.scheduledAt, language)}</span></div>
                <span className={`status status-${appointment.status.toLowerCase()}`}>{formatStatus(appointment.status, language)}</span>
                {["REQUESTED", "CONFIRMED"].includes(appointment.status) && (
                  <button onClick={() => void handleCancelAppointment(appointment)} type="button">{tr("Hủy lịch", "Cancel")}</button>
                )}
              </article>
            ))}
            {!isLoading && appointments.length === 0 && <p>{tr("Bạn chưa đặt lịch xem văn phòng.", "You have no office viewing appointments.")}</p>}
          </div>
        </div>

        <div className="profile-workspace-section">
          <div>
            <h3>{tr("Hợp đồng của tôi", "My contracts")}</h3>
            <p>{tr("Xem trạng thái và thời hạn của các hợp đồng gắn với tài khoản.", "Review the status and term of contracts linked to your account.")}</p>
          </div>
          <div className="profile-workspace-table">
            <DataTable
              columns={contractColumns}
              data={contracts}
              emptyDescription={tr("Tài khoản chưa có hợp đồng.", "No contracts are linked to this account.")}
              isLoading={isLoading}
              pageSize={5}
            />
          </div>
          <div className="profile-mobile-records">
            {isLoading && <div className="profile-mobile-loading"><span /><span /></div>}
            {contracts.map((contract) => (
              <article key={contract.id}>
                <div><strong>{formatContractTitle(contract.title, language)}</strong><span>{officeName(contract.officeId)}</span></div>
                <span className={`status status-${contract.status.toLowerCase()}`}>{formatStatus(contract.status, language)}</span>
                {contract.endDate && <small>{tr("Đến", "Until")} {formatDateOnly(contract.endDate, language)}</small>}
              </article>
            ))}
            {!isLoading && contracts.length === 0 && <p>{tr("Tài khoản chưa có hợp đồng.", "No contracts are linked to this account.")}</p>}
          </div>
        </div>
      </section>
    </main>
  );
}
