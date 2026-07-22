import { FormEvent, useMemo, useState } from "react";
import { navigate } from "../../app/router";
import {
  createAdminCustomer,
  type Customer,
  deleteAdminCustomer,
  getAdminCustomers,
  updateAdminCustomer
} from "../../features/admin/api/adminApi";
import { useAdminQuery } from "../../features/admin/hooks/useAdminQuery";
import { DataTable, type DataTableColumn } from "../../features/admin/shared/components/DataTable";
import { Drawer } from "../../features/admin/shared/components/Drawer";
import { useAdminGlobalSearch } from "../../features/admin/hooks/useAdminGlobalSearch";
import { toFriendlyMessage } from "../../lib/friendlyErrors";
import { useLanguage } from "../../features/i18n";
import { formatStatus } from "../../shared/utils/format";

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
  const { language, tr } = useLanguage();
  const { data, isLoading, error, refetch } = useAdminQuery(getAdminCustomers, []);
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [lastRemovedCustomer, setLastRemovedCustomer] = useState<Customer | null>(null);
  const [statusFilter, setStatusFilter] = useState<"ALL" | Customer["status"]>("ALL");
  const globalSearch = useAdminGlobalSearch();
  const customers = data?.items ?? [];
  const filteredCustomers = useMemo(() => customers.filter((customer) => {
    const query = globalSearch.toLowerCase();
    return (statusFilter === "ALL" || customer.status === statusFilter) &&
      (!query || `${customer.name} ${customer.email} ${customer.phone ?? ""}`.toLowerCase().includes(query));
  }), [customers, globalSearch, statusFilter]);

  const resetForm = () => {
    setForm(emptyForm);
    setLastRemovedCustomer(null);
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
        setActionSuccess(tr("Đã cập nhật khách hàng.", "Customer updated."));
      } else {
        await createAdminCustomer({
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          status: form.status
        });
        setActionSuccess(tr("Đã tạo khách hàng mới.", "Customer created."));
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
    if (!window.confirm(tr(
      `Xóa khách hàng "${customer.name}"? Hệ thống sẽ chặn nếu khách hàng còn hợp đồng hoặc yêu cầu thuê đang xử lý.`,
      `Remove customer "${customer.name}"? The system will block this action if the customer has active contracts or requests.`
    ))) return;
    setActionError(null);
    setActionSuccess(null);

    try {
      await deleteAdminCustomer(customer.id);
      setActionSuccess(tr("Đã ngừng hoạt động khách hàng.", "Customer marked as inactive."));
      setLastRemovedCustomer(customer);
      refetch();
    } catch (caught) {
      setActionError(toFriendlyMessage(caught));
    }
  };

  const undoRemove = async () => {
    if (!lastRemovedCustomer) return;
    setActionError(null);
    try {
      await updateAdminCustomer(lastRemovedCustomer.id, { status: "ACTIVE" });
      setActionSuccess(tr("Đã khôi phục khách hàng.", "Customer restored."));
      setLastRemovedCustomer(null);
      refetch();
    } catch (caught) {
      setActionError(toFriendlyMessage(caught));
    }
  };

  const columns: DataTableColumn<Customer>[] = [
    { key: "name", header: tr("Tên", "Name"), render: (row) => row.name },
    { key: "email", header: "Email", render: (row) => row.email },
    { key: "phone", header: tr("Điện thoại", "Phone"), render: (row) => row.phone || "-" },
    { key: "status", header: tr("Trạng thái", "Status"), render: (row) => <span className={`status status-${row.status.toLowerCase()}`}>{formatStatus(row.status, language)}</span> },
    {
      key: "actions",
      header: tr("Thao tác", "Actions"),
      render: (row) => (
        <div className="admin-row-actions">
          <button onClick={() => navigate(`/admin/customers/${encodeURIComponent(row.id)}`)} type="button">360°</button>
          <button onClick={() => editCustomer(row)} type="button">{tr("Sửa", "Edit")}</button>
          <button className="danger-action" onClick={() => void handleDelete(row)} type="button">{tr("Xóa", "Remove")}</button>
        </div>
      )
    }
  ];

  return (
    <section className="admin-page">
      <div className="admin-page-title admin-page-title-row">
        <div>
          <p className="eyebrow">CRM</p>
          <h1>{tr("Khách hàng", "Customers")}</h1>
        </div>
        <button className="admin-primary-action" onClick={() => { resetForm(); setIsFormOpen(true); }} type="button">
          {tr("Thêm khách hàng", "Add customer")}
        </button>
      </div>

      {error && <div className="notice danger">{error}</div>}
      {actionError && <div className="notice danger">{actionError}</div>}
      {actionSuccess && <div className="notice success admin-undo-notice"><span>{actionSuccess}</span>{lastRemovedCustomer && <button onClick={() => void undoRemove()} type="button">{tr("Hoàn tác", "Undo")}</button>}</div>}

      <div className="admin-filter-bar">
        <div><strong>{tr("Bộ lọc", "Filters")}</strong><span>{filteredCustomers.length} / {customers.length}</span></div>
        <label>{tr("Trạng thái", "Status")}
          <select onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} value={statusFilter}>
            <option value="ALL">{tr("Tất cả", "All")}</option>
            <option value="ACTIVE">{formatStatus("ACTIVE", language)}</option>
            <option value="INACTIVE">{formatStatus("INACTIVE", language)}</option>
          </select>
        </label>
      </div>

      <Drawer
        description={tr("Cập nhật hồ sơ mà không rời danh sách khách hàng.", "Update the profile without leaving the customer list.")}
        onClose={resetForm}
        open={isFormOpen}
        title={form.id ? tr("Chỉnh sửa khách hàng", "Edit customer") : tr("Thêm khách hàng", "Add customer")}
      >
        <form className="admin-drawer-form" onSubmit={(event) => void handleSubmit(event)}>
          <div className="form-grid">
            <label>
              {tr("Tên khách hàng", "Customer name")}
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            </label>
            <label>
              Email
              <input disabled={Boolean(form.id)} type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
            </label>
            <label>
              {tr("Điện thoại", "Phone")}
              <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
            </label>
            <label>
              {tr("Trạng thái", "Status")}
              <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Customer["status"] })}>
                <option value="ACTIVE">{formatStatus("ACTIVE", language)}</option>
                <option value="INACTIVE">{formatStatus("INACTIVE", language)}</option>
              </select>
            </label>
          </div>
          <div className="admin-form-actions">
            <button disabled={isSaving} type="submit">{form.id ? tr("Lưu thay đổi", "Save changes") : tr("Tạo khách hàng", "Create customer")}</button>
            <button className="secondary-action" onClick={resetForm} type="button">{tr("Hủy", "Cancel")}</button>
          </div>
        </form>
      </Drawer>

      <DataTable columns={columns} data={filteredCustomers} getRowKey={(row) => row.id} isLoading={isLoading} />
    </section>
  );
}
