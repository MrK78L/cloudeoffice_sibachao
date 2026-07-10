import { FormEvent, useState } from "react";
import {
  type Contract,
  createAdminContract,
  deleteAdminContract,
  getAdminContracts,
  type ContractPayload,
  updateAdminContract
} from "../../features/admin/api/adminApi";
import { useAdminQuery } from "../../features/admin/hooks/useAdminQuery";
import { DataTable, type DataTableColumn } from "../../features/admin/shared/components/DataTable";
import { toFriendlyMessage } from "../../lib/friendlyErrors";
import { formatCurrency } from "../../shared/utils/format";

type ContractForm = {
  id?: string;
  officeId: string;
  customerId: string;
  rentalRequestId: string;
  title: string;
  status: Contract["status"];
  startDate: string;
  endDate: string;
  monthlyPrice: string;
  fileKey: string;
};

const emptyForm: ContractForm = {
  officeId: "",
  customerId: "",
  rentalRequestId: "",
  title: "",
  status: "DRAFT",
  startDate: "",
  endDate: "",
  monthlyPrice: "",
  fileKey: ""
};

export function AdminContractsPage() {
  const { data, isLoading, error, refetch } = useAdminQuery(getAdminContracts, []);
  const [form, setForm] = useState<ContractForm>(emptyForm);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const contracts = data?.items ?? [];

  const resetForm = () => {
    setForm(emptyForm);
    setIsFormOpen(false);
  };

  const editContract = (contract: Contract) => {
    setForm({
      id: contract.id,
      officeId: contract.officeId,
      customerId: contract.customerId,
      rentalRequestId: contract.rentalRequestId ?? "",
      title: contract.title ?? "",
      status: contract.status,
      startDate: contract.startDate ?? "",
      endDate: contract.endDate ?? "",
      monthlyPrice: contract.monthlyPrice ? String(contract.monthlyPrice) : "",
      fileKey: contract.fileKey ?? ""
    });
    setActionError(null);
    setActionSuccess(null);
    setIsFormOpen(true);
  };

  const toPayload = (): ContractPayload => ({
    officeId: form.officeId.trim(),
    customerId: form.customerId.trim(),
    rentalRequestId: form.rentalRequestId.trim(),
    title: form.title.trim(),
    status: form.status,
    startDate: form.startDate,
    endDate: form.endDate,
    monthlyPrice: form.monthlyPrice ? Number(form.monthlyPrice) : undefined,
    fileKey: form.fileKey.trim()
  });

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      if (form.id) {
        await updateAdminContract(form.id, toPayload());
        setActionSuccess("Đã cập nhật hợp đồng.");
      } else {
        await createAdminContract(toPayload());
        setActionSuccess("Đã tạo hợp đồng mới.");
      }
      resetForm();
      refetch();
    } catch (caught) {
      setActionError(toFriendlyMessage(caught));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (contract: Contract) => {
    if (!window.confirm(`Xóa hợp đồng "${contract.id}"? Hệ thống sẽ chặn nếu hợp đồng đang chờ ký hoặc đang hiệu lực.`)) return;
    setActionError(null);
    setActionSuccess(null);

    try {
      await deleteAdminContract(contract.id);
      setActionSuccess("Đã kết thúc hợp đồng.");
      refetch();
    } catch (caught) {
      setActionError(toFriendlyMessage(caught));
    }
  };

  const columns: DataTableColumn<Contract>[] = [
    { key: "id", header: "Mã hợp đồng", render: (row) => row.id },
    { key: "office", header: "Văn phòng", render: (row) => row.officeId },
    { key: "customer", header: "Khách hàng", render: (row) => row.customerId },
    { key: "price", header: "Giá thuê", render: (row) => row.monthlyPrice ? formatCurrency(row.monthlyPrice) : "-" },
    { key: "status", header: "Trạng thái", render: (row) => <span className={`status status-${row.status.toLowerCase()}`}>{row.status}</span> },
    {
      key: "actions",
      header: "Thao tác",
      render: (row) => (
        <div className="admin-row-actions">
          <button onClick={() => editContract(row)} type="button">Sửa</button>
          <button className="danger-action" onClick={() => void handleDelete(row)} type="button">Xóa</button>
        </div>
      )
    }
  ];

  return (
    <section className="admin-page">
      <div className="admin-page-title admin-page-title-row">
        <div>
          <p className="eyebrow">Tài liệu</p>
          <h1>Hợp đồng</h1>
        </div>
        <button className="admin-primary-action" onClick={() => setIsFormOpen((value) => !value)} type="button">
          {isFormOpen ? "Đóng form" : "Thêm hợp đồng"}
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
              Khách hàng
              <input disabled={Boolean(form.id)} value={form.customerId} onChange={(event) => setForm({ ...form, customerId: event.target.value })} required />
            </label>
            <label>
              Mã yêu cầu thuê
              <input disabled={Boolean(form.id)} value={form.rentalRequestId} onChange={(event) => setForm({ ...form, rentalRequestId: event.target.value })} />
            </label>
            <label>
              Trạng thái
              <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Contract["status"] })}>
                <option value="DRAFT">DRAFT</option>
                <option value="PENDING_SIGNATURE">PENDING_SIGNATURE</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="EXPIRED">EXPIRED</option>
                <option value="TERMINATED">TERMINATED</option>
              </select>
            </label>
            <label>
              Ngày bắt đầu
              <input type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} />
            </label>
            <label>
              Ngày kết thúc
              <input type="date" value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} />
            </label>
            <label>
              Giá thuê
              <input min="0" type="number" value={form.monthlyPrice} onChange={(event) => setForm({ ...form, monthlyPrice: event.target.value })} />
            </label>
            <label>
              File key
              <input value={form.fileKey} onChange={(event) => setForm({ ...form, fileKey: event.target.value })} />
            </label>
            <label className="form-wide">
              Tiêu đề
              <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
            </label>
          </div>
          <div className="admin-form-actions">
            <button disabled={isSaving} type="submit">{form.id ? "Lưu thay đổi" : "Tạo hợp đồng"}</button>
            <button className="secondary-action" onClick={resetForm} type="button">Hủy</button>
          </div>
        </form>
      )}

      <DataTable columns={columns} data={contracts} isLoading={isLoading} />
    </section>
  );
}
