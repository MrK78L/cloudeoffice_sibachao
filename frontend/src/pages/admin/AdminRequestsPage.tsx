import { FormEvent, useState } from "react";
import {
  createAdminRentalRequest,
  deleteAdminRentalRequest,
  getAdminRentalRequests,
  updateAdminRentalRequestStatus
} from "../../features/admin/api/adminApi";
import { useAdminQuery } from "../../features/admin/hooks/useAdminQuery";
import { DataTable, type DataTableColumn } from "../../features/admin/shared/components/DataTable";
import type { RentalRequest } from "../../features/rental-requests";
import { toFriendlyMessage } from "../../lib/friendlyErrors";

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

export function AdminRequestsPage() {
  const { data, isLoading, error, refetch } = useAdminQuery(getAdminRentalRequests, []);
  const [form, setForm] = useState<RentalRequestForm>(emptyForm);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const requests = data?.items ?? [];

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
        setActionSuccess("Đã cập nhật trạng thái yêu cầu thuê.");
      } else {
        await createAdminRentalRequest({
          officeId: form.officeId.trim(),
          customerName: form.customerName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          message: form.message.trim()
        });
        setActionSuccess("Đã tạo yêu cầu thuê mới.");
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
    if (!window.confirm(`Hủy yêu cầu thuê "${request.id}"? Hệ thống sẽ chặn nếu yêu cầu đã duyệt hoặc có hợp đồng liên quan.`)) return;
    setActionError(null);
    setActionSuccess(null);

    try {
      await deleteAdminRentalRequest(request.id);
      setActionSuccess("Đã hủy yêu cầu thuê.");
      refetch();
    } catch (caught) {
      setActionError(toFriendlyMessage(caught));
    }
  };

  const columns: DataTableColumn<RentalRequest>[] = [
    { key: "id", header: "Mã yêu cầu", render: (row) => row.id },
    { key: "officeId", header: "Văn phòng", render: (row) => row.officeId },
    { key: "customer", header: "Khách hàng", render: (row) => row.customerName },
    { key: "email", header: "Email", render: (row) => row.email },
    { key: "status", header: "Trạng thái", render: (row) => <span className={`status status-${row.status.toLowerCase()}`}>{row.status}</span> },
    {
      key: "actions",
      header: "Thao tác",
      render: (row) => (
        <div className="admin-row-actions">
          <button onClick={() => editRequest(row)} type="button">Sửa</button>
          <button className="danger-action" onClick={() => void handleDelete(row)} type="button">Hủy</button>
        </div>
      )
    }
  ];

  return (
    <section className="admin-page">
      <div className="admin-page-title admin-page-title-row">
        <div>
          <p className="eyebrow">Duyệt hồ sơ</p>
          <h1>Yêu cầu thuê</h1>
        </div>
        <button className="admin-primary-action" onClick={() => setIsFormOpen((value) => !value)} type="button">
          {isFormOpen ? "Đóng form" : "Thêm yêu cầu"}
        </button>
      </div>

      {error && <div className="notice danger">{error}</div>}
      {actionError && <div className="notice danger">{actionError}</div>}
      {actionSuccess && <div className="notice success">{actionSuccess}</div>}

      {isFormOpen && (
        <form className="admin-form-panel" onSubmit={(event) => void handleSubmit(event)}>
          <div className="form-grid">
            <label>
              Mã văn phòng
              <input disabled={Boolean(form.id)} value={form.officeId} onChange={(event) => setForm({ ...form, officeId: event.target.value })} required />
            </label>
            <label>
              Trạng thái
              <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as RentalRequest["status"] })}>
                <option value="PENDING">PENDING</option>
                <option value="APPROVED">APPROVED</option>
                <option value="REJECTED">REJECTED</option>
                <option value="CANCELLED">CANCELLED</option>
              </select>
            </label>
            <label>
              Khách hàng
              <input disabled={Boolean(form.id)} value={form.customerName} onChange={(event) => setForm({ ...form, customerName: event.target.value })} required />
            </label>
            <label>
              Email
              <input disabled={Boolean(form.id)} type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
            </label>
            <label>
              Điện thoại
              <input disabled={Boolean(form.id)} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
            </label>
            <label className="form-wide">
              Nội dung trao đổi
              <textarea disabled={Boolean(form.id)} value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} rows={3} />
            </label>
            <label className="form-wide">
              Ghi chú xử lý
              <textarea value={form.decisionNote} onChange={(event) => setForm({ ...form, decisionNote: event.target.value })} rows={3} />
            </label>
          </div>
          <div className="admin-form-actions">
            <button disabled={isSaving} type="submit">{form.id ? "Lưu trạng thái" : "Tạo yêu cầu"}</button>
            <button className="secondary-action" onClick={resetForm} type="button">Hủy</button>
          </div>
        </form>
      )}

      <DataTable columns={columns} data={requests} isLoading={isLoading} />
    </section>
  );
}
