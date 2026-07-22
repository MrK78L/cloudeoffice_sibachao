import { ChangeEvent, useMemo, useState } from "react";
import { useMyWorkspace } from "../features/account/hooks/useMyWorkspace";
import { confirmContractFile, createContractFileUploadUrl, createContractRenewalRequest, uploadContractFile } from "../features/account/api/accountApi";
import { DataTable, type DataTableColumn } from "../features/admin/shared/components/DataTable";
import type { Contract } from "../features/admin/api/adminApi";
import type { RentalRequest } from "../features/rental-requests";
import { formatContractTitle, formatCurrency, formatDate, formatStatus } from "../shared/utils/format";
import { toFriendlyMessage } from "../lib/friendlyErrors";
import { useLanguage } from "../features/i18n";

export function MyContractsPage() {
  const { language, tr } = useLanguage();
  const { contracts, requests, offices, isLoading, error, refetch } = useMyWorkspace();
  const [uploadingId, setUploadingId] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [renewingId, setRenewingId] = useState("");
  const [renewalMessage, setRenewalMessage] = useState("");
  const officesById = useMemo(() => new Map(offices.map((office) => [office.id, office])), [offices]);
  const officeName = (officeId: string) => officesById.get(officeId)?.title ?? tr("Văn phòng không còn hoạt động", "Office no longer active");

  function canRequestRenewal(contract: Contract) {
    const now = Date.now();
    if (contract.status === "ACTIVE" && contract.endDate) {
      const end = Date.parse(contract.endDate);
      return Number.isFinite(end) && end >= now && end - now <= 30 * 24 * 60 * 60 * 1000;
    }
    return ["EXPIRED", "TERMINATED"].includes(contract.status) && Boolean(
      contract.renewalDeadline && Date.parse(contract.renewalDeadline) >= now
    );
  }

  function renewalRequestFor(contract: Contract) {
    return requests.find((request) => request.requestType === "RENEWAL" && request.renewalContractId === contract.id && ["PENDING", "APPROVED"].includes(request.status));
  }

  async function requestRenewal(contract: Contract) {
    if (!window.confirm(tr(
      `Gửi yêu cầu gia hạn cho ${officeName(contract.officeId)}?`,
      `Send a renewal request for ${officeName(contract.officeId)}?`
    ))) return;
    setRenewingId(contract.id);
    setRenewalMessage("");
    setUploadError("");
    try {
      await createContractRenewalRequest(contract.id);
      setRenewalMessage(tr("Đã gửi yêu cầu gia hạn. Bộ phận quản lý sẽ xem xét và phản hồi.", "Your renewal request has been sent for review."));
      refetch();
    } catch (caught) {
      setUploadError(toFriendlyMessage(caught));
    } finally {
      setRenewingId("");
    }
  }

  async function handleContractFile(contract: Contract, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploadError("");
    setUploadingId(contract.id);
    try {
      if (file.type !== "application/pdf") throw new Error(tr("Hợp đồng chỉ chấp nhận file PDF.", "Contract uploads must be PDF files."));
      if (file.size > 15 * 1024 * 1024) throw new Error(tr("File hợp đồng không được vượt quá 15 MB.", "Contract files cannot exceed 15 MB."));
      const upload = await createContractFileUploadUrl(contract.id, file);
      await uploadContractFile(upload.uploadUrl, file);
      await confirmContractFile(contract.id, upload.key);
    } catch (caught) {
      setUploadError(toFriendlyMessage(caught));
    } finally {
      setUploadingId("");
    }
  }

  const contractColumns: DataTableColumn<Contract>[] = [
    { key: "title", header: tr("Hợp đồng", "Contract"), render: (row) => formatContractTitle(row.title, language) },
    { key: "office", header: tr("Văn phòng", "Office"), render: (row) => officeName(row.officeId) },
    { key: "price", header: tr("Giá thuê", "Rent"), render: (row) => row.monthlyPrice ? formatCurrency(row.monthlyPrice, language) : "-" },
    { key: "term", header: tr("Thời gian", "Term"), render: (row) => row.startDate && row.endDate ? <><span>{formatDate(row.startDate, language)}</span><br /><small>{tr("đến", "to")} {formatDate(row.endDate, language)}</small></> : "-" },
    { key: "status", header: tr("Trạng thái", "Status"), render: (row) => <span className={`status status-${row.status.toLowerCase()}`}>{formatStatus(row.status, language)}</span> },
    {
      key: "file",
      header: tr("Tài liệu", "Document"),
      render: (row) => (
        <label className="table-upload-button">
          {uploadingId === row.id ? tr("Đang tải...", "Uploading...") : row.fileKey ? tr("Thay PDF", "Replace PDF") : tr("Tải PDF", "Upload PDF")}
          <input accept="application/pdf" disabled={Boolean(uploadingId)} onChange={(event) => void handleContractFile(row, event)} type="file" />
        </label>
      )
    },
    {
      key: "renewal",
      header: tr("Gia hạn", "Renewal"),
      render: (row) => {
        const request = renewalRequestFor(row);
        if (request) return <span className={`status status-${request.status.toLowerCase()}`}>{request.status === "APPROVED" ? tr("Đã duyệt gia hạn", "Renewal approved") : tr("Đang xét gia hạn", "Renewal pending")}</span>;
        if (!canRequestRenewal(row)) return <span className="muted">-</span>;
        return <button className="contract-renew-button" disabled={Boolean(renewingId)} onClick={() => void requestRenewal(row)} type="button">{renewingId === row.id ? tr("Đang gửi...", "Sending...") : tr("Yêu cầu gia hạn", "Request renewal")}</button>;
      }
    }
  ];

  const requestColumns: DataTableColumn<RentalRequest>[] = [
    { key: "request", header: tr("Nội dung", "Request"), render: (row) => row.requestType === "RENEWAL" ? tr("Yêu cầu gia hạn hợp đồng", "Contract renewal request") : row.message || tr("Yêu cầu thuê văn phòng", "Office leasing request") },
    { key: "office", header: tr("Văn phòng", "Office"), render: (row) => officeName(row.officeId) },
    { key: "message", header: tr("Ghi chú", "Notes"), render: (row) => row.message || "-" },
    { key: "status", header: tr("Trạng thái", "Status"), render: (row) => <span className={`status status-${row.status.toLowerCase()}`}>{formatStatus(row.status, language)}</span> }
  ];

  return (
    <main className="app-shell account-page contracts-account-page">
      <p className="eyebrow">{tr("Tài khoản", "Account")}</p>
      <h1>{tr("Hợp đồng của tôi", "My contracts")}</h1>
      {error && <div className="notice danger">{error}</div>}
      {uploadError && <div className="notice danger">{uploadError}</div>}
      {renewalMessage && <div className="notice success">{renewalMessage}</div>}

      <section className="admin-page">
        <div className="admin-page-title">
          <h2>{tr("Hợp đồng hiện có", "Current contracts")}</h2>
          <p className="muted">{tr("Theo dõi thời hạn, trạng thái và tài liệu hợp đồng của tài khoản.", "Track the term, status and documents associated with your account.")}</p>
        </div>
        <DataTable columns={contractColumns} data={contracts} isLoading={isLoading} />
      </section>

      <section className="admin-page">
        <div className="admin-page-title">
          <h2>{tr("Yêu cầu thuê", "Leasing requests")}</h2>
          <p className="muted">{tr("Theo dõi các yêu cầu thuê bạn đã gửi trên website.", "Track leasing requests you submitted on the website.")}</p>
        </div>
        <DataTable columns={requestColumns} data={requests} isLoading={isLoading} />
      </section>
    </main>
  );
}
