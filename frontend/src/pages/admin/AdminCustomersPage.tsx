import { FormEvent, useState } from "react";
import {
  createAdminCustomer,
  type Customer,
  deleteAdminCustomer,
  getAdminCustomers,
  updateAdminCustomer
} from "../../features/admin/api/adminApi";
import { useAdminQuery } from "../../features/admin/hooks/useAdminQuery";
import { DataTable, type DataTableColumn } from "../../features/admin/shared/components/DataTable";
import { toFriendlyMessage } from "../../lib/friendlyErrors";

type CustomerForm = {
  id?: string;
  name: string;
  email: string;
  phone: string;
  status: Customer["status"];
};

const emptyForm: CustomerForm = {
  name: "",
  email: "",
  phone: "",
  status: "ACTIVE"
};

export function AdminCustomersPage() {
  const { data, isLoading, error, refetch } = useAdminQuery(getAdminCustomers, []);
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const customers = data?.items ?? [];

  const resetForm = () => {
    setForm(emptyForm);
    setIsFormOpen(false);
  };

  const editCustomer = (customer: Customer) => {
    setForm({
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone ?? "",
      status: customer.status
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
        await updateAdminCustomer(form.id, {
          name: form.name.trim(),
          phone: form.phone.trim(),
          status: form.status
        });
        setActionSuccess("Đã cập nhật khách hàng.");
      } else {
        await createAdminCustomer({
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          status: form.status
        });
        setActionSuccess("Đã tạo khách hàng mới.");
      }
      resetForm();
      refetch();
    } catch (caught) {
      setActionError(toFriendlyMessage(caught));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (customer: Customer) => {
    if (!window.confirm(`Xóa khách hàng "${customer.name}"? Hệ thống sẽ chặn nếu khách hàng còn hợp đồng hoặc yêu cầu thuê đang xử lý.`)) return;
    setActionError(null);
    setActionSuccess(null);

    try {
      await deleteAdminCustomer(customer.id);
      setActionSuccess("Đã ngừng hoạt động khách hàng.");
      refetch();
    } catch (caught) {
      setActionError(toFriendlyMessage(caught));
    }
  };

  const columns: DataTableColumn<Customer>[] = [
    { key: "id", header: "Mã KH", render: (row) => row.id },
    { key: "name", header: "Tên", render: (row) => row.name },
    { key: "email", header: "Email", render: (row) => row.email },
    { key: "phone", header: "Điện thoại", render: (row) => row.phone || "-" },
    { key: "status", header: "Trạng thái", render: (row) => <span className={`status status-${row.status.toLowerCase()}`}>{row.status}</span> },
    {
      key: "actions",
      header: "Thao tác",
      render: (row) => (
        <div className="admin-row-actions">
          <button onClick={() => editCustomer(row)} type="button">Sửa</button>
          <button className="danger-action" onClick={() => void handleDelete(row)} type="button">Xóa</button>
        </div>
      )
    }
  ];

  return (
    <section className="admin-page">
      <div className="admin-page-title admin-page-title-row">
        <div>
          <p className="eyebrow">CRM</p>
          <h1>Khách hàng</h1>
        </div>
        <button className="admin-primary-action" onClick={() => setIsFormOpen((value) => !value)} type="button">
          {isFormOpen ? "Đóng form" : "Thêm khách hàng"}
        </button>
      </div>

      {error && <div className="notice danger">{error}</div>}
      {actionError && <div className="notice danger">{actionError}</div>}
      {actionSuccess && <div className="notice success">{actionSuccess}</div>}

      {isFormOpen && (
        <form className="admin-form-panel" onSubmit={(event) => void handleSubmit(event)}>
          <div className="form-grid">
            <label>
              Tên khách hàng
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            </label>
            <label>
              Email
              <input disabled={Boolean(form.id)} type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
            </label>
            <label>
              Điện thoại
              <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
            </label>
            <label>
              Trạng thái
              <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Customer["status"] })}>
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
              </select>
            </label>
          </div>
          <div className="admin-form-actions">
            <button disabled={isSaving} type="submit">{form.id ? "Lưu thay đổi" : "Tạo khách hàng"}</button>
            <button className="secondary-action" onClick={resetForm} type="button">Hủy</button>
          </div>
        </form>
      )}

      <DataTable columns={columns} data={customers} isLoading={isLoading} />
    </section>
  );
}
