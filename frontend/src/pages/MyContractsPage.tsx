import { ChangeEvent, useState } from "react";
import { useMyWorkspace } from "../features/account/hooks/useMyWorkspace";
import { confirmContractFile, createContractFileUploadUrl, uploadContractFile } from "../features/account/api/accountApi";
import { DataTable, type DataTableColumn } from "../features/admin/shared/components/DataTable";
import type { Contract } from "../features/admin/api/adminApi";
import type { RentalRequest } from "../features/rental-requests";
import { formatCurrency } from "../shared/utils/format";
import { toFriendlyMessage } from "../lib/friendlyErrors";

export function MyContractsPage() {
  const { contracts, requests, isLoading, error } = useMyWorkspace();
  const [uploadingId, setUploadingId] = useState("");
  const [uploadError, setUploadError] = useState("");

  async function handleContractFile(contract: Contract, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploadError("");
    setUploadingId(contract.id);
    try {
      if (file.type !== "application/pdf") throw new Error("Hợp đồng chỉ chấp nhận file PDF.");
      if (file.size > 15 * 1024 * 1024) throw new Error("File hợp đồng không được vượt quá 15 MB.");
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
    { key: "title", header: "Hợp đồng", render: (row) => row.title || row.id },
    { key: "office", header: "Văn phòng", render: (row) => row.officeId },
    { key: "price", header: "Giá thuê", render: (row) => row.monthlyPrice ? formatCurrency(row.monthlyPrice) : "-" },
    { key: "status", header: "Trạng thái", render: (row) => <span className={`status status-${row.status.toLowerCase()}`}>{row.status}</span> },
    {
      key: "file",
      header: "Tài liệu",
      render: (row) => (
        <label className="table-upload-button">
          {uploadingId === row.id ? "Đang tải..." : row.fileKey ? "Thay PDF" : "Tải PDF"}
          <input accept="application/pdf" disabled={Boolean(uploadingId)} onChange={(event) => void handleContractFile(row, event)} type="file" />
        </label>
      )
    }
  ];

  const requestColumns: DataTableColumn<RentalRequest>[] = [
    { key: "id", header: "Yêu cầu", render: (row) => row.id },
    { key: "office", header: "Văn phòng", render: (row) => row.officeId },
    { key: "message", header: "Ghi chú", render: (row) => row.message || "-" },
    { key: "status", header: "Trạng thái", render: (row) => <span className={`status status-${row.status.toLowerCase()}`}>{row.status}</span> }
  ];

  return (
    <main className="app-shell">
      <p className="eyebrow">Tài khoản</p>
      <h1>Hợp đồng của tôi</h1>
      {error && <div className="notice danger">{error}</div>}
      {uploadError && <div className="notice danger">{uploadError}</div>}

      <section className="admin-page">
        <div className="admin-page-title">
          <h2>Hợp đồng</h2>
          <p className="muted">Danh sách hợp đồng khớp với email tài khoản Cognito của bạn.</p>
        </div>
        <DataTable columns={contractColumns} data={contracts} isLoading={isLoading} />
      </section>

      <section className="admin-page">
        <div className="admin-page-title">
          <h2>Yêu cầu thuê</h2>
          <p className="muted">Các yêu cầu thuê bạn đã gửi từ frontend.</p>
        </div>
        <DataTable columns={requestColumns} data={requests} isLoading={isLoading} />
      </section>
    </main>
  );
}
