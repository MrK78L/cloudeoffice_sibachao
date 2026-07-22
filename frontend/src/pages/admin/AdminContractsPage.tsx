import { FormEvent, useMemo, useState } from "react";
import {
  type Contract,
  createAdminContract,
  deleteAdminContract,
  getAdminContracts,
  getAdminCustomers,
  getAdminOffices,
  getAdminRentalRequests,
  type ContractPayload,
  updateAdminContract
} from "../../features/admin/api/adminApi";
import { useAdminQuery } from "../../features/admin/hooks/useAdminQuery";
import { DataTable, type DataTableColumn } from "../../features/admin/shared/components/DataTable";
import { Drawer } from "../../features/admin/shared/components/Drawer";
import { useAdminGlobalSearch } from "../../features/admin/hooks/useAdminGlobalSearch";
import { toFriendlyMessage } from "../../lib/friendlyErrors";
import { formatContractTitle, formatCurrency, formatDate, formatStatus } from "../../shared/utils/format";
import { useLanguage } from "../../features/i18n";
import { formatOfficeLabel, OfficeSelect } from "../../features/admin/shared/components/OfficeSelect";

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

const contractTransitions: Record<Contract["status"], Contract["status"][]> = {
  DRAFT: ["DRAFT", "PENDING_SIGNATURE", "ACTIVE", "TERMINATED"],
  PENDING_SIGNATURE: ["PENDING_SIGNATURE", "ACTIVE", "TERMINATED"],
  ACTIVE: ["ACTIVE", "EXPIRED", "TERMINATED"],
  EXPIRED: ["EXPIRED", "ACTIVE"],
  TERMINATED: ["TERMINATED", "ACTIVE"]
};

function normalizeIdentity(value?: string) {
  return value?.trim().toLowerCase() ?? "";
}

function requestBelongsToCustomer(request: { email: string }, customer?: { id: string; email: string }) {
  if (!customer) return false;
  const requestEmail = normalizeIdentity(request.email);
  return [customer.id, customer.email].map(normalizeIdentity).includes(requestEmail);
}

function isRenewalOpen(contract: Contract) {
  return Boolean(contract.renewalDeadline && Date.now() <= Date.parse(contract.renewalDeadline));
}

function toDateTimeLocal(value?: string, endOfDay = false) {
  if (!value) return "";
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T${endOfDay ? "23:30" : "00:00"}:00` : value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function nextContractSlotLocal() {
  const slot = 30 * 60_000;
  return toDateTimeLocal(new Date(Math.ceil((Date.now() + 1000) / slot) * slot).toISOString());
}

function toIsoDateTime(value: string) {
  return value ? new Date(value).toISOString() : undefined;
}

export function AdminContractsPage() {
  const { language, tr } = useLanguage();
  const { data, isLoading, error, refetch } = useAdminQuery(getAdminContracts, []);
  const { data: officeData, isLoading: areOfficesLoading, error: officesError } = useAdminQuery(getAdminOffices, []);
  const { data: customerData, isLoading: areCustomersLoading, error: customersError } = useAdminQuery(getAdminCustomers, []);
  const { data: requestData, isLoading: areRequestsLoading, error: requestsError, refetch: refetchRequests } = useAdminQuery(getAdminRentalRequests, []);
  const [form, setForm] = useState<ContractForm>(emptyForm);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"ALL" | Contract["status"]>("ALL");
  const [expiringOnly, setExpiringOnly] = useState(false);
  const globalSearch = useAdminGlobalSearch();
  const contracts = data?.items ?? [];
  const offices = officeData?.items ?? [];
  const customers = customerData?.items ?? [];
  const rentalRequests = requestData?.items ?? [];
  const officesById = useMemo(() => new Map(offices.map((office) => [office.id, office])), [offices]);
  const customersById = useMemo(() => new Map(customers.flatMap((customer) => (
    [[normalizeIdentity(customer.id), customer], [normalizeIdentity(customer.email), customer]] as const
  ))), [customers]);
  const selectedCustomer = customersById.get(normalizeIdentity(form.customerId));
  const approvedRequestsForCustomer = rentalRequests.filter((request) => (
    request.status === "APPROVED" && request.requestType !== "RENEWAL" && requestBelongsToCustomer(request, selectedCustomer)
  ));
  const highlightedOfficeIds = new Set(approvedRequestsForCustomer.map((request) => request.officeId));
  const formOriginalStatus = form.id
    ? contracts.find((contract) => contract.id === form.id)?.status ?? form.status
    : form.status;
  const filteredContracts = useMemo(() => {
    const query = globalSearch.toLowerCase();
    const warningEnd = Date.now() + (30 * 24 * 60 * 60 * 1000);
    return contracts.filter((contract) =>
      (statusFilter === "ALL" || contract.status === statusFilter) &&
      (!expiringOnly || (contract.status === "ACTIVE" && Boolean(contract.endDate) && Date.parse(contract.endDate!) <= warningEnd)) &&
      (!query || `${contract.id} ${contract.title ?? ""} ${contract.officeId} ${contract.customerId}`.toLowerCase().includes(query))
    );
  }, [contracts, expiringOnly, globalSearch, statusFilter]);

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
      startDate: toDateTimeLocal(contract.startDate),
      endDate: toDateTimeLocal(contract.endDate, true),
      monthlyPrice: contract.monthlyPrice ? String(contract.monthlyPrice) : "",
      fileKey: contract.fileKey ?? ""
    });
    setActionError(null);
    setActionSuccess(null);
    setIsFormOpen(true);
  };

  const renewContract = (contract: Contract) => {
    const renewalRequest = rentalRequests.find((request) => request.requestType === "RENEWAL" && request.renewalContractId === contract.id && request.status === "APPROVED");
    if (!renewalRequest) {
      setActionError(tr("Khách hàng chưa có yêu cầu gia hạn đã được duyệt cho hợp đồng này.", "This contract does not have an approved customer renewal request."));
      return;
    }
    setForm({
      id: contract.id,
      officeId: contract.officeId,
      customerId: contract.customerId,
      rentalRequestId: renewalRequest.id,
      title: contract.title ?? "",
      status: "ACTIVE",
      startDate: nextContractSlotLocal(),
      endDate: "",
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
    startDate: toIsoDateTime(form.startDate),
    endDate: toIsoDateTime(form.endDate),
    monthlyPrice: form.monthlyPrice ? Number(form.monthlyPrice) : undefined,
    fileKey: form.fileKey.trim()
  });

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      if (["PENDING_SIGNATURE", "ACTIVE"].includes(form.status)) {
        const start = Date.parse(form.startDate);
        const end = Date.parse(form.endDate);
        if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
          throw new Error(tr("Thời gian bắt đầu phải trước thời gian kết thúc.", "The start time must be before the end time."));
        }
      }
      if (form.id) {
        await updateAdminContract(form.id, toPayload());
        setActionSuccess(tr("Đã cập nhật hợp đồng.", "Contract updated."));
      } else {
        await createAdminContract(toPayload());
        setActionSuccess(tr("Đã tạo hợp đồng mới.", "Contract created."));
      }
      resetForm();
      refetch();
      refetchRequests();
    } catch (caught) {
      setActionError(toFriendlyMessage(caught));
    } finally {
      setIsSaving(false);
    }
  };

  const handleTerminate = async (contract: Contract) => {
    const office = officesById.get(contract.officeId);
    if (!window.confirm(tr(
      `Kết thúc hợp đồng tại ${office?.title ?? "văn phòng này"}? Văn phòng sẽ được mở lại và yêu cầu thuê liên quan sẽ bị xóa.`,
      `End the contract for ${office?.title ?? "this office"}? The office will become available and the related leasing request will be deleted.`
    ))) return;
    setActionError(null);
    setActionSuccess(null);
    try {
      await updateAdminContract(contract.id, { status: "TERMINATED" });
      setActionSuccess(tr("Đã kết thúc hợp đồng. Có thể gia hạn trong 3 ngày.", "Contract ended. Renewal remains available for 3 days."));
      refetch();
      refetchRequests();
    } catch (caught) {
      setActionError(toFriendlyMessage(caught));
    }
  };

  const handleDelete = async (contract: Contract) => {
    if (!window.confirm(tr(
      `Xóa "${formatContractTitle(contract.title, "vi")}" khỏi danh sách? Dữ liệu đối soát vẫn được hệ thống lưu giữ.`,
      `Remove "${formatContractTitle(contract.title, "en")}" from the list? Audit data will still be retained.`
    ))) return;
    setActionError(null);
    setActionSuccess(null);

    try {
      await deleteAdminContract(contract.id);
      setActionSuccess(tr("Đã xóa hợp đồng khỏi danh sách.", "Contract removed from the list."));
      refetch();
    } catch (caught) {
      setActionError(toFriendlyMessage(caught));
    }
  };

  const renderContractActions = (contract: Contract) => {
    const renewalRequest = rentalRequests.find((request) => request.requestType === "RENEWAL" && request.renewalContractId === contract.id && ["PENDING", "APPROVED"].includes(request.status));
    return (
      <div className="admin-row-actions">
        <button onClick={() => editContract(contract)} type="button">{tr("Sửa", "Edit")}</button>
        {contract.status === "ACTIVE" && <button className="danger-action" onClick={() => void handleTerminate(contract)} type="button">{tr("Kết thúc", "End")}</button>}
        {["EXPIRED", "TERMINATED"].includes(contract.status) && isRenewalOpen(contract) && renewalRequest?.status === "APPROVED" && (
          <button onClick={() => renewContract(contract)} type="button">{tr("Gia hạn", "Renew")}</button>
        )}
        {["EXPIRED", "TERMINATED"].includes(contract.status) && isRenewalOpen(contract) && renewalRequest?.status === "PENDING" && (
          <span className="admin-action-note">{tr("Chờ duyệt yêu cầu gia hạn", "Renewal request pending")}</span>
        )}
        {["EXPIRED", "TERMINATED"].includes(contract.status) && isRenewalOpen(contract) && !renewalRequest && (
          <span className="admin-action-note">{tr("Chờ khách yêu cầu gia hạn", "Awaiting customer renewal request")}</span>
        )}
        {["EXPIRED", "TERMINATED"].includes(contract.status) && !isRenewalOpen(contract) && (
          <button className="danger-action" onClick={() => void handleDelete(contract)} type="button">{tr("Xóa", "Remove")}</button>
        )}
      </div>
    );
  };

  const columns: DataTableColumn<Contract>[] = [
    { key: "title", header: tr("Hợp đồng", "Contract"), render: (row) => formatContractTitle(row.title, language) },
    { key: "office", header: tr("Văn phòng", "Office"), render: (row) => {
      const office = officesById.get(row.officeId);
      return office ? formatOfficeLabel(office, language) : tr("Văn phòng không còn hiển thị", "Office no longer available");
    } },
    { key: "customer", header: tr("Khách hàng", "Customer"), render: (row) => {
      const customer = customersById.get(normalizeIdentity(row.customerId));
      return customer ? <><strong>{customer.name}</strong><br /><small>{customer.email}</small></> : <span>{tr("Khách hàng không còn hiển thị", "Customer no longer available")}</span>;
    } },
    { key: "term", header: tr("Thời hạn", "Term"), render: (row) => row.startDate && row.endDate ? <><span>{formatDate(row.startDate, language)}</span><br /><small>{tr("đến", "to")} {formatDate(row.endDate, language)}</small></> : "-" },
    { key: "price", header: tr("Giá thuê", "Rent"), render: (row) => row.monthlyPrice ? formatCurrency(row.monthlyPrice, language) : "-" },
    { key: "status", header: tr("Trạng thái", "Status"), render: (row) => (
      <div className="contract-status-cell">
        <span className={`status status-${row.status.toLowerCase()}`}>{formatStatus(row.status, language)}</span>
        {["EXPIRED", "TERMINATED"].includes(row.status) && row.renewalDeadline && isRenewalOpen(row) && (
          <small>{tr("Có thể gia hạn đến", "Renew by")} {formatDate(row.renewalDeadline, language)}</small>
        )}
      </div>
    ) },
    {
      key: "actions",
      header: tr("Thao tác", "Actions"),
      render: renderContractActions
    }
  ];

  return (
    <section className="admin-page">
      <div className="admin-page-title admin-page-title-row">
        <div>
          <p className="eyebrow">{tr("Tài liệu", "Documents")}</p>
          <h1>{tr("Hợp đồng", "Contracts")}</h1>
        </div>
        <button className="admin-primary-action" onClick={() => { resetForm(); setIsFormOpen(true); }} type="button">
          {tr("Thêm hợp đồng", "Add contract")}
        </button>
      </div>

      {error && <div className="notice danger">{error}</div>}
      {officesError && <div className="notice danger">{officesError}</div>}
      {customersError && <div className="notice danger">{customersError}</div>}
      {requestsError && <div className="notice danger">{requestsError}</div>}
      {actionError && <div className="notice danger">{actionError}</div>}
      {actionSuccess && <div className="notice success">{actionSuccess}</div>}

      <div className="admin-filter-bar">
        <div><strong>{tr("Bộ lọc", "Filters")}</strong><span>{filteredContracts.length} / {contracts.length}</span></div>
        <label>{tr("Trạng thái", "Status")}
          <select onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} value={statusFilter}>
            <option value="ALL">{tr("Tất cả", "All")}</option>
            <option value="DRAFT">{formatStatus("DRAFT", language)}</option>
            <option value="PENDING_SIGNATURE">{formatStatus("PENDING_SIGNATURE", language)}</option>
            <option value="ACTIVE">{formatStatus("ACTIVE", language)}</option>
            <option value="EXPIRED">{formatStatus("EXPIRED", language)}</option>
            <option value="TERMINATED">{formatStatus("TERMINATED", language)}</option>
          </select>
        </label>
        <label className="admin-check-filter"><input checked={expiringOnly} onChange={(event) => setExpiringOnly(event.target.checked)} type="checkbox" />{tr("Hết hạn trong 30 ngày", "Expires within 30 days")}</label>
      </div>

      <Drawer
        description={tr("Quản lý vòng đời hợp đồng và giá trị thuê hàng tháng.", "Manage the contract lifecycle and monthly rental value.")}
        onClose={resetForm}
        open={isFormOpen}
        title={form.id ? tr("Chỉnh sửa hợp đồng", "Edit contract") : tr("Thêm hợp đồng", "Add contract")}
        wide
      >
        <form className="admin-drawer-form" onSubmit={(event) => void handleSubmit(event)}>
          <div className="form-grid">
            <label>
              {tr("Khách hàng", "Customer")}
              <select disabled={Boolean(form.id) || areCustomersLoading} onChange={(event) => setForm({ ...form, customerId: event.target.value, officeId: "", rentalRequestId: "" })} required value={form.customerId}>
                <option value="">{areCustomersLoading ? tr("Đang tải khách hàng...", "Loading customers...") : tr("Chọn khách hàng", "Select a customer")}</option>
                {customers.map((customer) => (
                  <option disabled={customer.status === "INACTIVE" && customer.id !== form.customerId} key={customer.id} value={customer.id}>{customer.name} · {customer.email}</option>
                ))}
              </select>
            </label>
            <label>
              {tr("Văn phòng", "Office")}
              <OfficeSelect
                allowedStatuses={["AVAILABLE", "RESERVED"]}
                disabled={Boolean(form.id) || !form.customerId}
                highlightedOfficeIds={highlightedOfficeIds}
                isLoading={areOfficesLoading}
                offices={offices}
                onChange={(officeId) => {
                  const linkedRequest = approvedRequestsForCustomer.find((request) => request.officeId === officeId);
                  setForm({ ...form, officeId, rentalRequestId: linkedRequest?.id ?? "" });
                }}
                required
                value={form.officeId}
              />
              {!form.customerId && <small className="field-help">{tr("Chọn khách hàng trước để xem văn phòng phù hợp.", "Select a customer first to view suitable offices.")}</small>}
              {form.customerId && approvedRequestsForCustomer.length > 0 && <small className="contract-request-hint"><span />{tr("Nhãn 'Đã duyệt yêu cầu' cho biết khách hàng đã được duyệt thuê văn phòng đó.", "The 'Approved request' label shows offices this customer has been approved to rent.")}</small>}
            </label>
            <label>
              {tr("Yêu cầu thuê liên quan", "Related leasing request")}
              <select
                disabled={Boolean(form.id) || areRequestsLoading}
                onChange={(event) => {
                  const rentalRequestId = event.target.value;
                  const selectedRequest = rentalRequests.find((request) => request.id === rentalRequestId);
                  setForm({
                    ...form,
                    rentalRequestId,
                    officeId: selectedRequest?.officeId ?? form.officeId,
                    customerId: selectedCustomer?.id ?? form.customerId
                  });
                }}
                value={form.rentalRequestId}
              >
                <option value="">{areRequestsLoading ? tr("Đang tải yêu cầu...", "Loading requests...") : tr("Không liên kết yêu cầu", "No related request")}</option>
                {form.id && form.rentalRequestId && !approvedRequestsForCustomer.some((request) => request.id === form.rentalRequestId) && (
                  <option value={form.rentalRequestId}>{tr("Yêu cầu đã được xử lý", "Request already processed")}</option>
                )}
                {approvedRequestsForCustomer.map((request) => (
                  <option key={request.id} value={request.id}>{officesById.get(request.officeId)?.title ?? tr("Văn phòng không còn hiển thị", "Office no longer available")} · {tr("Đã duyệt", "Approved")}</option>
                ))}
              </select>
            </label>
            <label>
              {tr("Trạng thái", "Status")}
              <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Contract["status"] })}>
                {contractTransitions[formOriginalStatus].map((status) => (
                  <option key={status} value={status}>{formatStatus(status, language)}</option>
                ))}
              </select>
            </label>
            <label>
              {tr("Bắt đầu", "Starts at")}
              <input step="1800" type="datetime-local" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} />
            </label>
            <label>
              {tr("Kết thúc", "Ends at")}
              <input min={form.startDate || undefined} step="1800" type="datetime-local" value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} />
            </label>
            <label>
              {tr("Giá thuê", "Monthly rent")}
              <input min="0" type="number" value={form.monthlyPrice} onChange={(event) => setForm({ ...form, monthlyPrice: event.target.value })} />
            </label>
            <label className="form-wide">
              {tr("Tiêu đề", "Title")}
              <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
            </label>
          </div>
          <div className="admin-form-actions">
            <button disabled={isSaving} type="submit">{form.id ? tr("Lưu thay đổi", "Save changes") : tr("Tạo hợp đồng", "Create contract")}</button>
            <button className="secondary-action" onClick={resetForm} type="button">{tr("Hủy", "Cancel")}</button>
          </div>
        </form>
      </Drawer>

      <div className="admin-contracts-desktop-table">
        <DataTable columns={columns} data={filteredContracts} getRowKey={(row) => row.id} isLoading={isLoading} />
      </div>
      <div className="admin-contracts-mobile-list">
        {filteredContracts.map((contract) => {
          const office = officesById.get(contract.officeId);
          const customer = customersById.get(normalizeIdentity(contract.customerId));
          return (
            <article key={contract.id}>
              <header>
                <strong>{formatContractTitle(contract.title, language)}</strong>
                <span className={`status status-${contract.status.toLowerCase()}`}>{formatStatus(contract.status, language)}</span>
              </header>
              <dl>
                <div><dt>{tr("Văn phòng", "Office")}</dt><dd>{office ? formatOfficeLabel(office, language) : tr("Không còn hiển thị", "No longer available")}</dd></div>
                <div><dt>{tr("Khách hàng", "Customer")}</dt><dd>{customer?.name ?? tr("Không còn hiển thị", "No longer available")}</dd></div>
                <div><dt>{tr("Thời hạn", "Term")}</dt><dd>{contract.startDate && contract.endDate ? `${formatDate(contract.startDate, language)} ${tr("đến", "to")} ${formatDate(contract.endDate, language)}` : "-"}</dd></div>
                <div><dt>{tr("Giá thuê", "Rent")}</dt><dd>{contract.monthlyPrice ? formatCurrency(contract.monthlyPrice, language) : "-"}</dd></div>
              </dl>
              {contract.renewalDeadline && isRenewalOpen(contract) && <p>{tr("Có thể gia hạn đến", "Renew by")} {formatDate(contract.renewalDeadline, language)}</p>}
              {renderContractActions(contract)}
            </article>
          );
        })}
        {!isLoading && filteredContracts.length === 0 && <div className="admin-empty-state"><strong>{tr("Chưa có hợp đồng", "No contracts available")}</strong></div>}
      </div>
    </section>
  );
}
