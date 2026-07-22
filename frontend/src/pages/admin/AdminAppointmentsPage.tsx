import { FormEvent, useMemo, useState } from "react";
import type { Appointment } from "../../features/appointments";
import { createAdminAppointment, deleteAdminAppointment, getAdminAppointments, getAdminOffices, updateAdminAppointment } from "../../features/admin/api/adminApi";
import { useAdminQuery } from "../../features/admin/hooks/useAdminQuery";
import { DataTable, type DataTableColumn } from "../../features/admin/shared/components/DataTable";
import { toFriendlyMessage } from "../../lib/friendlyErrors";
import { formatDate, formatStatus } from "../../shared/utils/format";
import { useLanguage } from "../../features/i18n";
import { useAdminGlobalSearch } from "../../features/admin/hooks/useAdminGlobalSearch";
import { Drawer } from "../../features/admin/shared/components/Drawer";
import { formatOfficeLabel, OfficeSelect } from "../../features/admin/shared/components/OfficeSelect";

type AppointmentEditor = {
  id?: string;
  officeId: string;
  customerName: string;
  email: string;
  phone: string;
  scheduledAt: string;
  note: string;
  adminNote: string;
  status: Appointment["status"];
};

const emptyEditor: AppointmentEditor = {
  officeId: "",
  customerName: "",
  email: "",
  phone: "",
  scheduledAt: "",
  note: "",
  adminNote: "",
  status: "REQUESTED"
};

function toDateTimeLocal(value: string) {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function nextAppointmentSlotLocal() {
  const slotMilliseconds = 30 * 60_000;
  return toDateTimeLocal(new Date(Math.ceil((Date.now() + 1000) / slotMilliseconds) * slotMilliseconds).toISOString());
}

const appointmentTransitions: Record<Appointment["status"], Appointment["status"][]> = {
  REQUESTED: ["REQUESTED", "CONFIRMED", "REJECTED", "CANCELLED"],
  CONFIRMED: ["CONFIRMED", "COMPLETED", "CANCELLED"],
  COMPLETED: ["COMPLETED"],
  REJECTED: ["REJECTED"],
  CANCELLED: ["CANCELLED"]
};

const editableAppointmentStatuses = new Set<Appointment["status"]>(["REQUESTED", "CONFIRMED"]);

export function AdminAppointmentsPage() {
  const { language, tr } = useLanguage();
  const { data, isLoading, error, refetch } = useAdminQuery(getAdminAppointments, []);
  const { data: officeData, isLoading: areOfficesLoading, error: officesError } = useAdminQuery(getAdminOffices, []);
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [isSaving, setIsSaving] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editor, setEditor] = useState<AppointmentEditor>(emptyEditor);
  const [statusFilter, setStatusFilter] = useState<"ALL" | Appointment["status"]>("ALL");
  const [dateFilter, setDateFilter] = useState("");
  const globalSearch = useAdminGlobalSearch();
  const appointments = data?.items ?? [];
  const offices = officeData?.items ?? [];
  const officesById = useMemo(() => new Map((officeData?.items ?? []).map((office) => [office.id, office])), [officeData]);
  const editorOriginalStatus = editor.id
    ? appointments.find((appointment) => appointment.id === editor.id)?.status ?? editor.status
    : editor.status;
  const filteredAppointments = useMemo(() => {
    const query = globalSearch.toLowerCase();
    return appointments.filter((appointment) =>
      (statusFilter === "ALL" || appointment.status === statusFilter) &&
      (!dateFilter || appointment.scheduledAt.slice(0, 10) === dateFilter) &&
      (!query || `${appointment.customerName} ${appointment.email} ${appointment.phone ?? ""} ${appointment.officeId} ${officesById.get(appointment.officeId)?.title ?? ""}`.toLowerCase().includes(query))
    );
  }, [appointments, dateFilter, globalSearch, officesById, statusFilter]);

  async function changeStatus(item: Appointment, status: Appointment["status"]) {
    setIsSaving(item.id);
    setActionError("");
    setActionSuccess("");
    try {
      await updateAdminAppointment(item.id, { status });
      setActionSuccess(tr("Đã cập nhật trạng thái lịch hẹn.", "Appointment status updated."));
      refetch();
    } catch (caught) {
      setActionError(toFriendlyMessage(caught));
    } finally {
      setIsSaving("");
    }
  }

  function openCreate() {
    setEditor(emptyEditor);
    setActionError("");
    setActionSuccess("");
    setIsEditorOpen(true);
  }

  function openEdit(item: Appointment) {
    setEditor({
      id: item.id,
      officeId: item.officeId,
      customerName: item.customerName,
      email: item.email,
      phone: item.phone ?? "",
      scheduledAt: toDateTimeLocal(item.scheduledAt),
      note: item.note ?? "",
      adminNote: item.adminNote ?? "",
      status: item.status
    });
    setActionError("");
    setActionSuccess("");
    setIsEditorOpen(true);
  }

  async function removeAppointment(item: Appointment) {
    if (!["REJECTED", "CANCELLED"].includes(item.status)) {
      setActionError(tr(
        "Chỉ có thể xóa lịch hẹn đã hủy hoặc bị từ chối.",
        "Only cancelled or rejected appointments can be deleted."
      ));
      return;
    }
    if (Date.parse(item.scheduledAt) > Date.now()) {
      setActionError(tr(
        "Lịch hẹn chưa đến ngày. Hệ thống sẽ giữ lịch để khách hàng tiếp tục theo dõi.",
        "The appointment date has not passed. It remains visible so the customer can track it."
      ));
      return;
    }
    if (!window.confirm(tr(
      `Ẩn lịch hẹn của ${item.customerName} khỏi danh sách? Dữ liệu vẫn được lưu để đối chiếu.`,
      `Hide ${item.customerName}'s appointment from the list? The data will be retained for audit.`
    ))) return;
    setIsSaving(item.id);
    setActionError("");
    setActionSuccess("");
    try {
      await deleteAdminAppointment(item.id);
      setActionSuccess(tr("Đã xóa lịch hẹn khỏi danh sách.", "Appointment removed from the list."));
      refetch();
    } catch (caught) {
      setActionError(toFriendlyMessage(caught));
    } finally {
      setIsSaving("");
    }
  }

  async function saveAppointment(event: FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setActionError("");
    setActionSuccess("");
    try {
      const selectedTime = new Date(editor.scheduledAt);
      if (!editor.scheduledAt || !Number.isFinite(selectedTime.getTime()) || selectedTime.getTime() <= Date.now()) {
        throw new Error(tr("Vui lòng chọn thời gian trong tương lai.", "Please choose a future date and time."));
      }
      if (selectedTime.getMinutes() % 30 !== 0) {
        throw new Error(tr("Vui lòng chọn khung giờ cách nhau 30 phút.", "Please choose a 30-minute time slot."));
      }
      const scheduledAt = selectedTime.toISOString();
      if (editor.id) {
        await updateAdminAppointment(editor.id, {
          status: editor.status,
          scheduledAt,
          adminNote: editor.adminNote.trim()
        });
        setActionSuccess(tr("Đã cập nhật lịch hẹn.", "Appointment updated."));
      } else {
        await createAdminAppointment({
          officeId: editor.officeId.trim(),
          customerName: editor.customerName.trim(),
          email: editor.email.trim(),
          phone: editor.phone.trim(),
          scheduledAt,
          note: editor.note.trim()
        });
        setActionSuccess(tr("Đã tạo lịch hẹn.", "Appointment created."));
      }
      setIsEditorOpen(false);
      setEditor(emptyEditor);
      refetch();
    } catch (caught) {
      setActionError(toFriendlyMessage(caught));
    } finally {
      setIsSubmitting(false);
    }
  }

  const columns: DataTableColumn<Appointment>[] = [
    { key: "time", header: tr("Thời gian", "Date and time"), render: (row) => formatDate(row.scheduledAt, language) },
    { key: "office", header: tr("Văn phòng", "Office"), render: (row) => {
      const office = officesById.get(row.officeId);
      return office ? formatOfficeLabel(office, language) : tr("Văn phòng không còn hiển thị", "Office no longer available");
    } },
    { key: "customer", header: tr("Khách hàng", "Customer"), render: (row) => <><strong>{row.customerName}</strong><br /><small>{row.email}</small></> },
    { key: "status", header: tr("Trạng thái", "Status"), render: (row) => <span className={`status status-${row.status.toLowerCase()}`}>{formatStatus(row.status, language)}</span> },
    {
      key: "actions",
      header: tr("Xử lý", "Review"),
      render: (row) => (
        <div className="admin-row-actions appointment-row-actions">
          <select
            aria-label={`${tr("Cập nhật lịch hẹn", "Update appointment")} ${row.id}`}
            disabled={isSaving === row.id || !editableAppointmentStatuses.has(row.status)}
            onChange={(event) => void changeStatus(row, event.target.value as Appointment["status"])}
            value={row.status}
          >
            {appointmentTransitions[row.status].map((status) => (
              <option key={status} value={status}>{formatStatus(status, language)}</option>
            ))}
          </select>
          <button disabled={isSaving === row.id || !editableAppointmentStatuses.has(row.status)} onClick={() => openEdit(row)} type="button">{tr("Đổi lịch", "Reschedule")}</button>
          {["REJECTED", "CANCELLED"].includes(row.status) && (
            <button className="danger-action" disabled={isSaving === row.id} onClick={() => void removeAppointment(row)} type="button">{tr("Xóa", "Delete")}</button>
          )}
        </div>
      )
    }
  ];

  return (
    <section className="admin-page">
      <div className="admin-page-title admin-page-title-row">
        <div>
          <p className="eyebrow">{tr("Lịch tư vấn", "Consultation calendar")}</p>
          <h1>{tr("Lịch xem văn phòng", "Office appointments")}</h1>
          <p>{tr("Tạo lịch mới, xác nhận hoặc dời lịch theo thời gian phù hợp.", "Create, confirm, or reschedule office viewing appointments.")}</p>
        </div>
        <button className="admin-primary-action" onClick={openCreate} type="button">{tr("Đặt lịch", "Schedule")}</button>
      </div>
      {error && <div className="notice danger">{error}</div>}
      {officesError && <div className="notice danger">{officesError}</div>}
      {actionError && <div className="notice danger">{actionError}</div>}
      {actionSuccess && <div className="notice success">{actionSuccess}</div>}

      <Drawer
        description={editor.id ? tr("Chọn thời gian mới và lưu để dời lịch.", "Choose a new time and save to reschedule.") : tr("Tạo lịch thay mặt khách hàng.", "Create an appointment on behalf of a customer.")}
        onClose={() => setIsEditorOpen(false)}
        open={isEditorOpen}
        title={editor.id ? tr("Đổi lịch hẹn", "Reschedule appointment") : tr("Đặt lịch hẹn", "Schedule appointment")}
      >
        <form className="admin-drawer-form" onSubmit={(event) => void saveAppointment(event)}>
          <div className="form-grid">
            <label>{tr("Văn phòng", "Office")}<OfficeSelect allowedStatuses={["AVAILABLE", "RESERVED"]} disabled={Boolean(editor.id)} isLoading={areOfficesLoading} offices={offices} onChange={(officeId) => setEditor({ ...editor, officeId })} required value={editor.officeId} /></label>
            <label>{tr("Trạng thái", "Status")}
              <select disabled={!editor.id} onChange={(event) => setEditor({ ...editor, status: event.target.value as Appointment["status"] })} value={editor.status}>
                {appointmentTransitions[editorOriginalStatus].map((status) => (
                  <option key={status} value={status}>{formatStatus(status, language)}</option>
                ))}
              </select>
            </label>
            <label>{tr("Khách hàng", "Customer")}<input disabled={Boolean(editor.id)} onChange={(event) => setEditor({ ...editor, customerName: event.target.value })} required value={editor.customerName} /></label>
            <label>Email<input disabled={Boolean(editor.id)} onChange={(event) => setEditor({ ...editor, email: event.target.value })} required type="email" value={editor.email} /></label>
            <label>{tr("Điện thoại", "Phone")}<input disabled={Boolean(editor.id)} onChange={(event) => setEditor({ ...editor, phone: event.target.value })} value={editor.phone} /></label>
            <label>{tr("Thời gian", "Date and time")}<input min={nextAppointmentSlotLocal()} onChange={(event) => setEditor({ ...editor, scheduledAt: event.target.value })} required step="1800" type="datetime-local" value={editor.scheduledAt} /></label>
            {!editor.id && <label className="form-wide">{tr("Ghi chú của khách", "Customer note")}<textarea onChange={(event) => setEditor({ ...editor, note: event.target.value })} rows={3} value={editor.note} /></label>}
            {editor.id && <label className="form-wide">{tr("Ghi chú xử lý", "Admin note")}<textarea onChange={(event) => setEditor({ ...editor, adminNote: event.target.value })} rows={3} value={editor.adminNote} /></label>}
          </div>
          <div className="admin-form-actions">
            <button disabled={isSubmitting} type="submit">{isSubmitting ? tr("Đang lưu...", "Saving...") : editor.id ? tr("Lưu lịch mới", "Save new time") : tr("Tạo lịch", "Create appointment")}</button>
            <button className="secondary-action" onClick={() => setIsEditorOpen(false)} type="button">{tr("Hủy", "Cancel")}</button>
          </div>
        </form>
      </Drawer>
      <div className="admin-filter-bar">
        <div><strong>{tr("Bộ lọc lịch", "Schedule filters")}</strong><span>{filteredAppointments.length} / {appointments.length}</span></div>
        <label>{tr("Ngày", "Date")}<input onChange={(event) => setDateFilter(event.target.value)} type="date" value={dateFilter} /></label>
        <label>{tr("Trạng thái", "Status")}
          <select onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} value={statusFilter}>
            <option value="ALL">{tr("Tất cả", "All")}</option>
            <option value="REQUESTED">{formatStatus("REQUESTED", language)}</option>
            <option value="CONFIRMED">{formatStatus("CONFIRMED", language)}</option>
            <option value="COMPLETED">{formatStatus("COMPLETED", language)}</option>
            <option value="REJECTED">{formatStatus("REJECTED", language)}</option>
            <option value="CANCELLED">{formatStatus("CANCELLED", language)}</option>
          </select>
        </label>
        {(dateFilter || statusFilter !== "ALL") && <button className="admin-clear-filters" onClick={() => { setDateFilter(""); setStatusFilter("ALL"); }} type="button">{tr("Xóa lọc", "Clear")}</button>}
      </div>
      <DataTable columns={columns} data={filteredAppointments} getRowKey={(row) => row.id} isLoading={isLoading} />
    </section>
  );
}
