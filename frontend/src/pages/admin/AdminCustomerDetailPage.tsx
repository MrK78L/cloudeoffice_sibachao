import { useState } from "react";
import { navigate } from "../../app/router";
import { type Contract, getAdminCustomerOverview } from "../../features/admin/api/adminApi";
import { useAdminQuery } from "../../features/admin/hooks/useAdminQuery";
import { DataTable, type DataTableColumn } from "../../features/admin/shared/components/DataTable";
import type { Appointment } from "../../features/appointments";
import { useLanguage } from "../../features/i18n";
import type { RentalRequest } from "../../features/rental-requests";
import { formatContractTitle, formatCurrency, formatDate, formatStatus } from "../../shared/utils/format";

type DetailTab = "activity" | "requests" | "appointments" | "contracts";

export function AdminCustomerDetailPage({ customerId }: { customerId: string }) {
  const { language, tr } = useLanguage();
  const [tab, setTab] = useState<DetailTab>("activity");
  const { data, isLoading, error } = useAdminQuery(() => getAdminCustomerOverview(customerId), [customerId]);
  const overview = data?.item;
  const officeName = (officeId: string) => overview?.offices[officeId]?.title ?? tr("Văn phòng không còn hiển thị", "Office no longer available");
  const statusCell = (status: string) => <span className={`status status-${status.toLowerCase()}`}>{formatStatus(status, language)}</span>;

  const requestColumns: DataTableColumn<RentalRequest>[] = [
    { key: "office", header: tr("Văn phòng", "Office"), render: (row) => officeName(row.officeId) },
    { key: "created", header: tr("Ngày tạo", "Created"), render: (row) => formatDate(row.createdAt, language) },
    { key: "status", header: tr("Trạng thái", "Status"), render: (row) => statusCell(row.status) }
  ];
  const appointmentColumns: DataTableColumn<Appointment>[] = [
    { key: "office", header: tr("Văn phòng", "Office"), render: (row) => officeName(row.officeId) },
    { key: "time", header: tr("Thời gian", "Date and time"), render: (row) => formatDate(row.scheduledAt, language) },
    { key: "status", header: tr("Trạng thái", "Status"), render: (row) => statusCell(row.status) }
  ];
  const contractColumns: DataTableColumn<Contract>[] = [
    { key: "id", header: tr("Hợp đồng", "Contract"), render: (row) => formatContractTitle(row.title, language) },
    { key: "office", header: tr("Văn phòng", "Office"), render: (row) => officeName(row.officeId) },
    { key: "rent", header: tr("Giá thuê", "Rent"), render: (row) => row.monthlyPrice ? formatCurrency(row.monthlyPrice, language) : "-" },
    { key: "status", header: tr("Trạng thái", "Status"), render: (row) => statusCell(row.status) }
  ];

  return (
    <section className="admin-page customer-360-page">
      <div className="admin-page-title admin-page-title-row">
        <div>
          <button className="admin-back-button" onClick={() => navigate("/admin/customers")} type="button">← {tr("Khách hàng", "Customers")}</button>
          <h1>{overview?.customer.name ?? tr("Hồ sơ khách hàng", "Customer profile")}</h1>
          {overview && <p>{overview.customer.email} · {overview.customer.phone || tr("Chưa có số điện thoại", "No phone number")}</p>}
        </div>
        {overview && statusCell(overview.customer.status)}
      </div>

      {error && <div className="notice danger">{error}</div>}
      {isLoading && <div className="customer-360-loading"><span /><span /><span /></div>}

      {overview && (
        <>
          <div className="customer-summary-strip">
            <div><span>{tr("Yêu cầu đang mở", "Open requests")}</span><strong>{overview.summary.openRequests}</strong></div>
            <div><span>{tr("Lịch hẹn sắp tới", "Upcoming appointments")}</span><strong>{overview.summary.upcomingAppointments}</strong></div>
            <div><span>{tr("Hợp đồng hiệu lực", "Active contracts")}</span><strong>{overview.summary.activeContracts}</strong></div>
            <div><span>{tr("Tài liệu", "Documents")}</span><strong>{overview.documents.length}</strong></div>
          </div>

          <div className="admin-tabs" role="tablist">
            {([
              ["activity", tr("Dòng thời gian", "Timeline")],
              ["requests", tr("Yêu cầu thuê", "Requests")],
              ["appointments", tr("Lịch hẹn", "Appointments")],
              ["contracts", tr("Hợp đồng", "Contracts")]
            ] as Array<[DetailTab, string]>).map(([value, label]) => (
              <button aria-selected={tab === value} className={tab === value ? "active" : ""} key={value} onClick={() => setTab(value)} role="tab" type="button">{label}</button>
            ))}
          </div>

          {tab === "activity" && (
            <div className="customer-timeline">
              {overview.activities.map((activity) => (
                <article key={`${activity.type}-${activity.id}`}>
                  <span className={`timeline-dot status-${activity.status.toLowerCase()}`} />
                  <div>
                    <strong>{activity.type === "RENTAL_REQUEST" ? tr("Yêu cầu thuê", "Leasing request") : activity.type === "APPOINTMENT" ? tr("Lịch hẹn", "Appointment") : tr("Hợp đồng", "Contract")}</strong>
                    <p>{officeName(activity.officeId)} · {formatStatus(activity.status, language)}</p>
                    <time>{formatDate(activity.at, language)}</time>
                  </div>
                </article>
              ))}
              {overview.activities.length === 0 && <div className="admin-empty-state"><strong>{tr("Chưa có hoạt động", "No activity yet")}</strong></div>}
            </div>
          )}
          {tab === "requests" && <DataTable columns={requestColumns} data={overview.rentalRequests} getRowKey={(row) => row.id} />}
          {tab === "appointments" && <DataTable columns={appointmentColumns} data={overview.appointments} getRowKey={(row) => row.id} />}
          {tab === "contracts" && <DataTable columns={contractColumns} data={overview.contracts} getRowKey={(row) => row.id} />}
        </>
      )}
    </section>
  );
}
