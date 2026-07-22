import { FormEvent, useEffect, useState } from "react";
import { navigate } from "../../../app/router";
import { useAuth } from "../../auth";
import { useCreateRentalRequest } from "../hooks/useCreateRentalRequest";
import { useLanguage } from "../../i18n";

type RentalRequestFormProps = {
  officeId?: string;
};

export function RentalRequestForm({ officeId }: RentalRequestFormProps) {
  const { isAuthenticated, user } = useAuth();
  const { tr } = useLanguage();
  const { mutate, isPending, error } = useCreateRentalRequest();
  const [customerName, setCustomerName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (user?.name) setCustomerName((current) => current || user.name || "");
  }, [user?.name]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setNotice("");

    if (!officeId) {
      setNotice(tr("Vui lòng chọn văn phòng.", "Please select an office."));
      return;
    }

    if (!isAuthenticated) {
      setNotice(tr("Bạn cần đăng nhập bằng email và mật khẩu trước khi gửi yêu cầu thuê.", "Please sign in with your email and password before submitting a leasing request."));
      return;
    }

    try {
      const item = await mutate({ officeId, customerName: customerName.trim(), phone: phone.trim(), message: message.trim() });
      setNotice(`${tr("Đã tạo yêu cầu thuê", "Leasing request created")}: ${item.id}`);
      setCustomerName(user?.name ?? "");
      setPhone("");
      setMessage("");
    } catch {
      // The hook exposes a customer-friendly error next to the form.
    }
  }

  return (
    <form className="request-form" onSubmit={handleSubmit}>
      <h2>{tr("Gửi yêu cầu thuê", "Submit a leasing request")}</h2>
      {notice && <div className="notice">{notice}</div>}
      {error && <div className="notice danger">{error}</div>}
      <label>
        {tr("Họ tên", "Full name")}
        <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} required />
      </label>
      <label>
        Email
        <input type="email" value={user?.email ?? ""} readOnly required />
      </label>
      <label>
        {tr("Số điện thoại", "Phone number")}
        <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="090..." />
      </label>
      <label>
        {tr("Ghi chú", "Notes")}
        <textarea value={message} onChange={(event) => setMessage(event.target.value)} />
      </label>
      <div className="auth-actions">
        <button disabled={isPending || !officeId} type="submit">
          {isPending ? tr("Đang gửi...", "Sending...") : tr("Gửi yêu cầu", "Submit request")}
        </button>
        {!isAuthenticated && (
          <button className="ghost-button" onClick={() => navigate("/login")} type="button">
            {tr("Đăng nhập", "Sign in")}
          </button>
        )}
      </div>
    </form>
  );
}
