import { useEffect, useState } from "react";
import { cancelMyAppointment, getMyAppointments } from "../features/appointments/api/appointmentsApi";
import type { Appointment } from "../features/appointments";
import { DataTable, type DataTableColumn } from "../features/admin/shared/components/DataTable";
import { toFriendlyMessage } from "../lib/friendlyErrors";
import { formatDate, formatStatus } from "../shared/utils/format";
import { useLanguage } from "../features/i18n";
import { useOffices } from "../features/offices/hooks/useOffices";

export function MyAppointmentsPage() {
  const { language, tr } = useLanguage();
  const [items, setItems] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const { items: offices } = useOffices({ limit: 200 });
  const officeName = (officeId: string) => offices.find((office) => office.id === officeId)?.title ?? tr("Văn phòng không còn hoạt động", "Office no longer active");

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
    if (!window.confirm(tr("Bạn muốn hủy lịch xem văn phòng này?", "Do you want to cancel this office appointment?"))) return;
    try {
      await cancelMyAppointment(item.id);
      await load();
    } catch (caught) {
      setError(toFriendlyMessage(caught));
    }
  }

  const columns: DataTableColumn<Appointment>[] = [
    { key: "office", header: tr("Văn phòng", "Office"), render: (row) => officeName(row.officeId) },
    { key: "time", header: tr("Thời gian", "Date and time"), render: (row) => formatDate(row.scheduledAt, language) },
    { key: "status", header: tr("Trạng thái", "Status"), render: (row) => <span className={`status status-${row.status.toLowerCase()}`}>{formatStatus(row.status, language)}</span> },
    { key: "note", header: tr("Ghi chú", "Notes"), render: (row) => row.adminNote || row.note || "-" },
    {
      key: "action",
      header: tr("Thao tác", "Actions"),
      render: (row) => ["REQUESTED", "CONFIRMED"].includes(row.status)
        ? <button className="link-button" onClick={() => void cancel(row)} type="button">{tr("Hủy lịch", "Cancel")}</button>
        : "-"
    }
  ];

  return (
    <main className="app-shell account-page">
      <p className="eyebrow">{tr("Tài khoản", "Account")}</p>
      <h1>{tr("Lịch xem văn phòng", "Office appointments")}</h1>
      <p className="muted">{tr("Theo dõi thời gian và trạng thái xác nhận từ đội tư vấn.", "Track appointment times and confirmation status from our advisory team.")}</p>
      {error && <div className="notice danger">{error}</div>}
      <DataTable columns={columns} data={items} isLoading={isLoading} />
    </main>
  );
}
