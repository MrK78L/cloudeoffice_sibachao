import { FormEvent, useState } from "react";
import { navigate } from "../../../app/router";
import { useAuth } from "../../auth";
import { useCreateRentalRequest } from "../hooks/useCreateRentalRequest";

type RentalRequestFormProps = {
  officeId?: string;
};

export function RentalRequestForm({ officeId }: RentalRequestFormProps) {
  const { isAuthenticated, user } = useAuth();
  const { mutate, isPending, error } = useCreateRentalRequest();
  const [customerName, setCustomerName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setNotice("");

    if (!officeId) {
      setNotice("Vui lòng chọn văn phòng.");
      return;
    }

    if (!isAuthenticated) {
      setNotice("Bạn cần đăng nhập bằng email và mật khẩu trước khi gửi yêu cầu thuê.");
      return;
    }

    const item = await mutate({ officeId, customerName, email, phone, message });
    setNotice(`Đã tạo yêu cầu thuê: ${item.id}`);
    setCustomerName(user?.name ?? "");
    setEmail(user?.email ?? "");
    setPhone("");
    setMessage("");
  }

  return (
    <form className="request-form" onSubmit={handleSubmit}>
      <h2>Gửi yêu cầu thuê</h2>
      {notice && <div className="notice">{notice}</div>}
      {error && <div className="notice danger">{error}</div>}
      <label>
        Họ tên
        <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} required />
      </label>
      <label>
        Email
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
      </label>
      <label>
        Số điện thoại
        <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="090..." />
      </label>
      <label>
        Ghi chú
        <textarea value={message} onChange={(event) => setMessage(event.target.value)} />
      </label>
      <div className="auth-actions">
        <button disabled={isPending || !officeId} type="submit">
          {isPending ? "Đang gửi..." : "Gửi yêu cầu"}
        </button>
        {!isAuthenticated && (
          <button className="ghost-button" onClick={() => navigate("/login")} type="button">
            Đăng nhập
          </button>
        )}
      </div>
    </form>
  );
}
