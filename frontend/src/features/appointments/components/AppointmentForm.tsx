import { FormEvent, useState } from "react";
import { navigate } from "../../../app/router";
import { useAuth } from "../../auth";
import { toFriendlyMessage } from "../../../lib/friendlyErrors";
import { createAppointment } from "../api/appointmentsApi";

export function AppointmentForm({ officeId }: { officeId?: string }) {
  const { isAuthenticated, user } = useAuth();
  const [customerName, setCustomerName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    setIsSaving(true);
    setError("");
    setMessage("");
    try {
      await createAppointment({
        officeId: officeId ?? "",
        customerName: customerName.trim(),
        email: user?.email ?? "",
        phone: phone.trim(),
        scheduledAt: new Date(scheduledAt).toISOString(),
        note: note.trim()
      });
      setScheduledAt("");
      setNote("");
      setMessage("Đã gửi lịch hẹn. Đội tư vấn sẽ xác nhận với bạn sớm nhất.");
    } catch (caught) {
      setError(toFriendlyMessage(caught));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="request-form appointment-form" onSubmit={(event) => void handleSubmit(event)}>
      <div>
        <p className="eyebrow">Tham quan thực tế</p>
        <h2>Đặt lịch xem văn phòng</h2>
        <p className="muted">Chọn thời gian phù hợp để đội tư vấn chuẩn bị đón tiếp.</p>
      </div>
      {message && <div className="notice success">{message}</div>}
      {error && <div className="notice danger">{error}</div>}
      <label>Họ và tên<input onChange={(event) => setCustomerName(event.target.value)} required value={customerName} /></label>
      <label>Số điện thoại<input onChange={(event) => setPhone(event.target.value)} value={phone} /></label>
      <label>Thời gian<input min={new Date().toISOString().slice(0, 16)} onChange={(event) => setScheduledAt(event.target.value)} required type="datetime-local" value={scheduledAt} /></label>
      <label>Ghi chú<textarea onChange={(event) => setNote(event.target.value)} rows={3} value={note} /></label>
      <button disabled={isSaving || !officeId} type="submit">
        {!isAuthenticated ? "Đăng nhập để đặt lịch" : isSaving ? "Đang gửi..." : "Gửi lịch hẹn"}
      </button>
    </form>
  );
}
