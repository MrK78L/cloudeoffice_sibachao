import { FormEvent, useEffect, useState } from "react";
import { navigate } from "../../../app/router";
import { useAuth } from "../../auth";
import { toFriendlyMessage } from "../../../lib/friendlyErrors";
import { createAppointment } from "../api/appointmentsApi";
import { useLanguage } from "../../i18n";

function localDateTimeMinimum() {
  const slotMilliseconds = 30 * 60_000;
  const nextSlot = new Date(Math.ceil((Date.now() + 1000) / slotMilliseconds) * slotMilliseconds);
  return new Date(nextSlot.getTime() - nextSlot.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function AppointmentForm({ officeId }: { officeId?: string }) {
  const { isAuthenticated, user } = useAuth();
  const { tr } = useLanguage();
  const [customerName, setCustomerName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (user?.name) setCustomerName((current) => current || user.name || "");
  }, [user?.name]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    if (!officeId) {
      setError(tr("Vui lòng chọn văn phòng trước khi đặt lịch.", "Please select an office before scheduling."));
      return;
    }
    const selectedTime = new Date(scheduledAt);
    if (!scheduledAt || !Number.isFinite(selectedTime.getTime()) || selectedTime.getTime() <= Date.now()) {
      setError(tr("Vui lòng chọn thời gian trong tương lai.", "Please choose a future date and time."));
      return;
    }
    if (selectedTime.getMinutes() % 30 !== 0) {
      setError(tr("Vui lòng chọn khung giờ cách nhau 30 phút.", "Please choose a 30-minute time slot."));
      return;
    }
    setIsSaving(true);
    setError("");
    setMessage("");
    try {
      await createAppointment({
        officeId,
        customerName: customerName.trim(),
        phone: phone.trim(),
        scheduledAt: selectedTime.toISOString(),
        note: note.trim()
      });
      setScheduledAt("");
      setNote("");
      setMessage(tr("Đã gửi lịch hẹn. Đội tư vấn sẽ xác nhận với bạn sớm nhất.", "Your appointment request has been sent. Our advisory team will confirm it shortly."));
    } catch (caught) {
      setError(toFriendlyMessage(caught));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="request-form appointment-form" onSubmit={(event) => void handleSubmit(event)}>
      <div className="appointment-form-intro">
        <p className="eyebrow">{tr("Tham quan thực tế", "On-site visit")}</p>
        <h2>{tr("Đặt lịch xem văn phòng", "Schedule an office tour")}</h2>
        <p className="muted">{tr("Chọn thời gian phù hợp để đội tư vấn chuẩn bị đón tiếp.", "Choose a convenient time so our advisory team can prepare for your visit.")}</p>
      </div>
      {message && <div className="notice success">{message}</div>}
      {error && <div className="notice danger">{error}</div>}
      <label className="appointment-field-name">
        {tr("Họ và tên", "Full name")}
        <input onChange={(event) => setCustomerName(event.target.value)} required value={customerName} />
      </label>
      <label className="appointment-field-phone">
        {tr("Số điện thoại", "Phone number")}
        <input onChange={(event) => setPhone(event.target.value)} value={phone} />
      </label>
      <label className="appointment-field-time">
        {tr("Thời gian", "Date and time")}
        <input min={localDateTimeMinimum()} onChange={(event) => setScheduledAt(event.target.value)} required step="1800" type="datetime-local" value={scheduledAt} />
      </label>
      <label className="appointment-field-note">
        {tr("Ghi chú", "Notes")}
        <textarea onChange={(event) => setNote(event.target.value)} rows={3} value={note} />
      </label>
      <button className="appointment-submit" disabled={isSaving || !officeId} type="submit">
        {!isAuthenticated ? tr("Đăng nhập để đặt lịch", "Sign in to schedule") : isSaving ? tr("Đang gửi...", "Sending...") : tr("Gửi lịch hẹn", "Request appointment")}
      </button>
    </form>
  );
}
