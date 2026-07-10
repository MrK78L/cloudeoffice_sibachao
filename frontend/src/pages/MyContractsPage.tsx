import { useMyWorkspace } from "../features/account/hooks/useMyWorkspace";
import { DataTable, type DataTableColumn } from "../features/admin/shared/components/DataTable";
import type { Contract } from "../features/admin/api/adminApi";
import type { RentalRequest } from "../features/rental-requests";
import { formatCurrency } from "../shared/utils/format";

export function MyContractsPage() {
  const { contracts, requests, isLoading, error } = useMyWorkspace();

  const contractColumns: DataTableColumn<Contract>[] = [
    { key: "title", header: "Hợp đồng", render: (row) => row.title || row.id },
    { key: "office", header: "Văn phòng", render: (row) => row.officeId },
    { key: "price", header: "Giá thuê", render: (row) => row.monthlyPrice ? formatCurrency(row.monthlyPrice) : "-" },
    { key: "status", header: "Trạng thái", render: (row) => <span className={`status status-${row.status.toLowerCase()}`}>{row.status}</span> }
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
