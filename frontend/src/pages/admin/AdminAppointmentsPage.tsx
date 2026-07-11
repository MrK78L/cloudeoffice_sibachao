import { useState } from "react";
import type { Appointment } from "../../features/appointments";
import { getAdminAppointments, updateAdminAppointment } from "../../features/admin/api/adminApi";
import { useAdminQuery } from "../../features/admin/hooks/useAdminQuery";
import { DataTable, type DataTableColumn } from "../../features/admin/shared/components/DataTable";
import { toFriendlyMessage } from "../../lib/friendlyErrors";
import { formatDate, formatStatus } from "../../shared/utils/format";

export function AdminAppointmentsPage() {
  const { data, isLoading, error, refetch } = useAdminQuery(getAdminAppointments, []);
  const [actionError, setActionError] = useState("");
  const [isSaving, setIsSaving] = useState("");

  async function changeStatus(item: Appointment, status: Appointment["status"]) {
    setIsSaving(item.id);
    setActionError("");
    try {
      await updateAdminAppointment(item.id, { status });
      refetch();
    } catch (caught) {
      setActionError(toFriendlyMessage(caught));
    } finally {
      setIsSaving("");
    }
  }

  const columns: DataTableColumn<Appointment>[] = [
    { key: "time", header: "Thời gian", render: (row) => formatDate(row.scheduledAt) },
    { key: "office", header: "Văn phòng", render: (row) => row.officeId },
    { key: "customer", header: "Khách hàng", render: (row) => <><strong>{row.customerName}</strong><br /><small>{row.email}</small></> },
    { key: "status", header: "Trạng thái", render: (row) => <span className={`status status-${row.status.toLowerCase()}`}>{formatStatus(row.status)}</span> },
    {
      key: "actions",
      header: "Xử lý",
      render: (row) => (
        <select
          aria-label={`Cập nhật lịch hẹn ${row.id}`}
          disabled={isSaving === row.id || ["COMPLETED", "REJECTED", "CANCELLED"].includes(row.status)}
          onChange={(event) => void changeStatus(row, event.target.value as Appointment["status"])}
          value={row.status}
        >
          <option value="REQUESTED">Chờ xác nhận</option>
          <option value="CONFIRMED">Đã xác nhận</option>
          <option value="COMPLETED">Đã hoàn thành</option>
          <option value="REJECTED">Từ chối</option>
          <option value="CANCELLED">Đã hủy</option>
        </select>
      )
    }
  ];

  return (
    <section className="admin-page">
      <div className="admin-page-title">
        <p className="eyebrow">Lịch tư vấn</p>
        <h1>Lịch xem văn phòng</h1>
      </div>
      {error && <div className="notice danger">{error}</div>}
      {actionError && <div className="notice danger">{actionError}</div>}
      <DataTable columns={columns} data={data?.items ?? []} isLoading={isLoading} />
    </section>
  );
}
