import { FormEvent, useMemo, useState } from "react";
import {
  createAdminRentalRequest,
  deleteAdminRentalRequest,
  getAdminAppointments,
  getAdminOffices,
  getAdminRentalRequests,
  updateAdminRentalRequestStatus
} from "../../features/admin/api/adminApi";
import { useAdminQuery } from "../../features/admin/hooks/useAdminQuery";
import { DataTable, type DataTableColumn } from "../../features/admin/shared/components/DataTable";
import { Drawer } from "../../features/admin/shared/components/Drawer";
import { useAdminGlobalSearch } from "../../features/admin/hooks/useAdminGlobalSearch";
import type { RentalRequest } from "../../features/rental-requests";
import { toFriendlyMessage } from "../../lib/friendlyErrors";
import { useLanguage } from "../../features/i18n";
import { formatDate, formatStatus } from "../../shared/utils/format";
import { navigate } from "../../app/router";
import { formatOfficeLabel, OfficeSelect } from "../../features/admin/shared/components/OfficeSelect";

type RentalRequestForm = {
  id?: string;
  officeId: string;
  customerName: string;
  email: string;
  phone: string;
  message: string;
  status: RentalRequest["status"];
  decisionNote: string;
};

const emptyForm: RentalRequestForm = {
  officeId: "",
  customerName: "",
  email: "",
  phone: "",
  message: "",
  status: "PENDING",
  decisionNote: ""
};

const rentalRequestTransitions: Record<RentalRequest["status"], RentalRequest["status"][]> = {
  PENDING: ["PENDING", "APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["APPROVED"],
  REJECTED: ["REJECTED"],
  CANCELLED: ["CANCELLED"]
};

export function AdminRequestsPage() {
  const { language, tr } = useLanguage();
  const { data, isLoading, error, refetch } = useAdminQuery(getAdminRentalRequests, []);
  const { data: appointmentData } = useAdminQuery(getAdminAppointments, []);
  const { data: officeData, isLoading: areOfficesLoading, error: officesError } = useAdminQuery(getAdminOffices, []);
  const [form, setForm] = useState<RentalRequestForm>(emptyForm);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"pipeline" | "table">("pipeline");
  const [statusFilter, setStatusFilter] = useState<"ALL" | RentalRequest["status"]>("ALL");
  const globalSearch = useAdminGlobalSearch();
  const requests = data?.items ?? [];
  const appointments = appointmentData?.items ?? [];
  const offices = officeData?.items ?? [];
  const officesById = useMemo(() => new Map((officeData?.items ?? []).map((office) => [office.id, office])), [officeData]);
  const formOriginalStatus = form.id
    ? requests.find((request) => request.id === form.id)?.status ?? form.status
    : form.status;
  const filteredRequests = useMemo(() => {
    const query = globalSearch.toLowerCase();
    return requests.filter((request) =>
      (statusFilter === "ALL" || request.status === statusFilter) &&
      (!query || `${request.customerName} ${request.email} ${request.phone ?? ""} ${request.officeId} ${officesById.get(request.officeId)?.title ?? ""}`.toLowerCase().includes(query))
    );
  }, [globalSearch, officesById, requests, statusFilter]);
  const appointmentsByRequest = useMemo(() => new Map(filteredRequests.map((request) => {
    const matches = appointments
      .filter((appointment) => appointment.email === request.email && appointment.officeId === request.officeId)
      .sort((left, right) => Date.parse(left.scheduledAt) - Date.parse(right.scheduledAt));
    return [request.id, matches];
  })), [appointments, filteredRequests]);

  const resetForm = () => {
    setForm(emptyForm);
    setIsFormOpen(false);
  };

  const editRequest = (request: RentalRequest) => {
    setForm({
      id: request.id,
      officeId: request.officeId,
      customerName: request.customerName,
      email: request.email,
      phone: request.phone ?? "",
      message: request.message ?? "",
      status: request.status,
      decisionNote: request.decisionNote ?? ""
    });
    setActionError(null);
    setActionSuccess(null);
    setIsFormOpen(true);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      if (form.id) {
        await updateAdminRentalRequestStatus(form.id, {
          status: form.status,
          decisionNote: form.decisionNote.trim()
        });
        setActionSuccess(tr("Đã cập nhật trạng thái yêu cầu thuê.", "Leasing request status updated."));
      } else {
        await createAdminRentalRequest({
          officeId: form.officeId.trim(),
          customerName: form.customerName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          message: form.message.trim()
        });
        setActionSuccess(tr("Đã tạo yêu cầu thuê mới.", "Leasing request created."));
      }
      resetForm();
      refetch();
    } catch (caught) {
      setActionError(toFriendlyMessage(caught));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (request: RentalRequest) => {
    if (!window.confirm(tr(
      `Xóa yêu cầu thuê của ${request.customerName} khỏi danh sách? Dữ liệu vẫn được lưu để đối chiếu.`,
      `Remove ${request.customerName}'s leasing request from the list? The data will be retained for audit.`
    ))) return;
    setActionError(null);
    setActionSuccess(null);

    try {
      await deleteAdminRentalRequest(request.id);
      setActionSuccess(tr("Đã xóa yêu cầu thuê khỏi danh sách.", "Leasing request removed from the list."));
      refetch();
    } catch (caught) {
      setActionError(toFriendlyMessage(caught));
    }
  };

  const columns: DataTableColumn<RentalRequest>[] = [
    { key: "type", header: tr("Loại yêu cầu", "Request type"), render: (row) => row.requestType === "RENEWAL" ? <span className="request-type-renewal">{tr("Gia hạn", "Renewal")}</span> : tr("Thuê mới", "New lease") },
    { key: "officeId", header: tr("Văn phòng", "Office"), render: (row) => {
      const office = officesById.get(row.officeId);
      return office ? formatOfficeLabel(office, language) : tr("Văn phòng không còn hiển thị", "Office no longer available");
    } },
    { key: "customer", header: tr("Khách hàng", "Customer"), render: (row) => row.customerName },
    { key: "email", header: "Email", render: (row) => row.email },
    { key: "status", header: tr("Trạng thái", "Status"), render: (row) => <span className={`status status-${row.status.toLowerCase()}`}>{formatStatus(row.status, language)}</span> },
    {
      key: "actions",
      header: tr("Thao tác", "Actions"),
      render: (row) => (
        <div className="admin-row-actions">
          <button onClick={() => editRequest(row)} type="button">{tr("Sửa", "Edit")}</button>
          {["REJECTED", "CANCELLED"].includes(row.status) && (
            <button className="danger-action" onClick={() => void handleDelete(row)} type="button">{tr("Xóa", "Delete")}</button>
          )}
        </div>
      )
    }
  ];

  return (
    <section className="admin-page">
      <div className="admin-page-title admin-page-title-row">
        <div>
          <p className="eyebrow">{tr("Duyệt hồ sơ", "Request review")}</p>
          <h1>{tr("Yêu cầu thuê", "Leasing requests")}</h1>
        </div>
        <button className="admin-primary-action" onClick={() => { resetForm(); setIsFormOpen(true); }} type="button">
          {tr("Thêm yêu cầu", "Add request")}
        </button>
      </div>

      {error && <div className="notice danger">{error}</div>}
      {officesError && <div className="notice danger">{officesError}</div>}
      {actionError && <div className="notice danger">{actionError}</div>}
      {actionSuccess && <div className="notice success">{actionSuccess}</div>}

      <div className="admin-filter-bar">
        <div className="admin-segmented-control">
          <button className={viewMode === "pipeline" ? "active" : ""} onClick={() => setViewMode("pipeline")} type="button">Pipeline</button>
          <button className={viewMode === "table" ? "active" : ""} onClick={() => setViewMode("table")} type="button">{tr("Danh sách", "List")}</button>
        </div>
        <label>{tr("Trạng thái", "Status")}
          <select onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} value={statusFilter}>
            <option value="ALL">{tr("Tất cả", "All")}</option>
            <option value="PENDING">{formatStatus("PENDING", language)}</option>
            <option value="APPROVED">{formatStatus("APPROVED", language)}</option>
            <option value="REJECTED">{formatStatus("REJECTED", language)}</option>
            <option value="CANCELLED">{formatStatus("CANCELLED", language)}</option>
          </select>
        </label>
        <span className="admin-filter-count">{filteredRequests.length} {tr("yêu cầu", "requests")}</span>
      </div>

      <Drawer
        description={tr("Duyệt trạng thái và ghi lại nội dung xử lý yêu cầu.", "Review status and record the request decision.")}
        onClose={resetForm}
        open={isFormOpen}
        title={form.id ? tr("Xử lý yêu cầu", "Review request") : tr("Thêm yêu cầu", "Add request")}
      >
        <form className="admin-drawer-form" onSubmit={(event) => void handleSubmit(event)}>
          <div className="form-grid">
            <label>
              {tr("Văn phòng", "Office")}
              <OfficeSelect allowedStatuses={["AVAILABLE", "RESERVED"]} disabled={Boolean(form.id)} isLoading={areOfficesLoading} offices={offices} onChange={(officeId) => setForm({ ...form, officeId })} required value={form.officeId} />
            </label>
            <label>
              {tr("Trạng thái", "Status")}
              <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as RentalRequest["status"] })}>
                {rentalRequestTransitions[formOriginalStatus].map((status) => (
                  <option key={status} value={status}>{formatStatus(status, language)}</option>
                ))}
              </select>
            </label>
            <label>
              {tr("Khách hàng", "Customer")}
              <input disabled={Boolean(form.id)} value={form.customerName} onChange={(event) => setForm({ ...form, customerName: event.target.value })} required />
            </label>
            <label>
              Email
              <input disabled={Boolean(form.id)} type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
            </label>
            <label>
              {tr("Điện thoại", "Phone")}
              <input disabled={Boolean(form.id)} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
            </label>
            <label className="form-wide">
              {tr("Nội dung trao đổi", "Request message")}
              <textarea disabled={Boolean(form.id)} value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} rows={3} />
            </label>
            <label className="form-wide">
              {tr("Ghi chú xử lý", "Decision note")}
              <textarea value={form.decisionNote} onChange={(event) => setForm({ ...form, decisionNote: event.target.value })} rows={3} />
            </label>
          </div>
          <div className="admin-form-actions">
            <button disabled={isSaving} type="submit">{form.id ? tr("Lưu trạng thái", "Save status") : tr("Tạo yêu cầu", "Create request")}</button>
            <button className="secondary-action" onClick={resetForm} type="button">{tr("Hủy", "Cancel")}</button>
          </div>
        </form>
      </Drawer>

      {viewMode === "table" && <DataTable columns={columns} data={filteredRequests} getRowKey={(row) => row.id} isLoading={isLoading} />}
      {viewMode === "pipeline" && (
        <div className="request-pipeline">
          {(["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as RentalRequest["status"][]).map((status) => {
            const stageItems = filteredRequests.filter((request) => request.status === status);
            return (
              <section className="pipeline-column" key={status}>
                <header><span className={`status-dot ${status.toLowerCase()}`} /><strong>{formatStatus(status, language)}</strong><small>{stageItems.length}</small></header>
                <div>
                  {stageItems.map((request) => {
                    const linkedAppointments = appointmentsByRequest.get(request.id) ?? [];
                    const nextAppointment = linkedAppointments.find((item) => ["REQUESTED", "CONFIRMED"].includes(item.status));
                    return (
                      <article className="pipeline-card" key={request.id} onClick={() => editRequest(request)}>
                        {request.requestType === "RENEWAL" && <span className="request-type-renewal">{tr("Gia hạn", "Renewal")}</span>}
                        <strong>{request.customerName}</strong>
                        <span>{officesById.get(request.officeId)?.title ?? tr("Văn phòng không còn hiển thị", "Office no longer available")}</span>
                        <small>{request.email}</small>
                        <div className={nextAppointment ? "pipeline-appointment linked" : "pipeline-appointment"}>
                          {nextAppointment
                            ? `${tr("Lịch hẹn", "Appointment")}: ${formatDate(nextAppointment.scheduledAt, language)}`
                            : tr("Chưa có lịch xem", "No appointment scheduled")}
                        </div>
                        <button onClick={(event) => { event.stopPropagation(); editRequest(request); }} type="button">{tr("Xử lý", "Review")}</button>
                      </article>
                    );
                  })}
                  {stageItems.length === 0 && <p className="pipeline-empty">{tr("Không có yêu cầu", "No requests")}</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}
      <button className="admin-inline-link" onClick={() => navigate("/admin/appointments")} type="button">{tr("Mở lịch hẹn đầy đủ", "Open appointment calendar")} →</button>
    </section>
  );
}
