import { useEffect, useState } from "react";
import { cancelMyAppointment, getMyAppointments } from "../features/appointments/api/appointmentsApi";
import type { Appointment } from "../features/appointments";
import { DataTable, type DataTableColumn } from "../features/admin/shared/components/DataTable";
import { toFriendlyMessage } from "../lib/friendlyErrors";
import { formatDate, formatStatus } from "../shared/utils/format";

export function MyAppointmentsPage() {
  const [items, setItems] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setIsLoading(true);
    setError("");
    try {
      setItems((await getMyAppointments()).items);
    } catch (caught) {
      setError(toFriendlyMessage(caught));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function cancel(item: Appointment) {
    if (!window.confirm("Bạn muốn hủy lịch xem văn phòng này?")) return;
    try {
      await cancelMyAppointment(item.id);
      await load();
    } catch (caught) {
      setError(toFriendlyMessage(caught));
    }
  }

  const columns: DataTableColumn<Appointment>[] = [
    { key: "office", header: "Văn phòng", render: (row) => row.officeId },
    { key: "time", header: "Thời gian", render: (row) => formatDate(row.scheduledAt) },
    { key: "status", header: "Trạng thái", render: (row) => <span className={`status status-${row.status.toLowerCase()}`}>{formatStatus(row.status)}</span> },
    { key: "note", header: "Ghi chú", render: (row) => row.adminNote || row.note || "-" },
    {
      key: "action",
      header: "Thao tác",
      render: (row) => ["REQUESTED", "CONFIRMED"].includes(row.status)
        ? <button className="link-button" onClick={() => void cancel(row)} type="button">Hủy lịch</button>
        : "-"
    }
  ];

  return (
    <main className="app-shell account-page">
      <p className="eyebrow">Tài khoản</p>
      <h1>Lịch xem văn phòng</h1>
      <p className="muted">Theo dõi thời gian và trạng thái xác nhận từ đội tư vấn.</p>
      {error && <div className="notice danger">{error}</div>}
      <DataTable columns={columns} data={items} isLoading={isLoading} />
    </main>
  );
}
