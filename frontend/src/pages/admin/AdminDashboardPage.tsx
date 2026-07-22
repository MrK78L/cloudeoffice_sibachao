import { useState } from "react";
import { navigate } from "../../app/router";
import { downloadAdminReport, getAdminStats } from "../../features/admin/api/adminApi";
import { useAdminQuery } from "../../features/admin/hooks/useAdminQuery";
import { useLanguage } from "../../features/i18n";
import { formatContractTitle, formatDate, formatStatus } from "../../shared/utils/format";

export function AdminDashboardPage() {
  const { language, tr } = useLanguage();
  const { data, isLoading, error } = useAdminQuery(getAdminStats, []);
  const stats = data?.item;
  const [reportError, setReportError] = useState("");

  async function downloadReport(type: "offices" | "customers") {
    setReportError("");
    try {
      await downloadAdminReport(type);
    } catch {
      setReportError(tr("Không thể xuất báo cáo lúc này. Vui lòng thử lại.", "Unable to export the report right now. Please try again."));
    }
  }

  const availableOffices = stats?.officeStatusCounts?.AVAILABLE ?? 0;
  const cards = [
    {
      label: tr("Tỷ lệ lấp đầy", "Occupancy"),
      value: `${stats?.occupancyRate ?? 0}%`,
      note: `${stats?.activeContracts ?? 0}/${stats?.offices ?? 0} ${tr("văn phòng", "offices")}`,
      tone: "blue",
      path: "/admin/offices"
    },
    {
      label: tr("Văn phòng đang trống", "Available offices"),
      value: availableOffices,
      note: tr("Sẵn sàng tiếp nhận khách thuê", "Ready for new tenants"),
      tone: "green",
      path: "/admin/offices"
    },
    {
      label: tr("Yêu cầu chờ xử lý", "Pending requests"),
      value: stats?.pendingRentalRequests ?? 0,
      note: tr("Cần phản hồi khách hàng", "Awaiting customer response"),
      tone: "orange",
      path: "/admin/requests"
    },
    {
      label: tr("Lịch hẹn chờ xác nhận", "Appointments to confirm"),
      value: stats?.pendingAppointments ?? 0,
      note: tr("Lịch xem văn phòng", "Office viewings"),
      tone: "violet",
      path: "/admin/appointments"
    }
  ];
  const officeStatuses = ["AVAILABLE", "RESERVED", "LEASED", "INACTIVE"] as const;
  const totalOffices = Object.values(stats?.officeStatusCounts ?? {}).reduce((sum, value) => sum + value, 0);

  return (
    <section className="admin-page operations-dashboard">
      <div className="admin-page-title admin-page-title-row">
        <div>
          <p className="eyebrow">Operations</p>
          <h1>{tr("Tổng quan vận hành", "Operations overview")}</h1>
          <p>{tr("Theo dõi công suất văn phòng và các công việc cần ưu tiên xử lý.", "Track office utilization and work requiring immediate attention.")}</p>
        </div>
        <div className="dashboard-date">
          {new Intl.DateTimeFormat(language === "vi" ? "vi-VN" : "en-US", { dateStyle: "full" }).format(new Date())}
        </div>
      </div>

      {error && <div className="notice danger">{error}</div>}
      {reportError && <div className="notice danger">{reportError}</div>}

      <div className="stats-grid operations-kpis" aria-busy={isLoading}>
        {cards.map((stat) => (
          <button
            aria-label={`${stat.label}: ${stat.value}`}
            className={`stat-card stat-${stat.tone}`}
            key={stat.label}
            onClick={() => navigate(stat.path)}
            type="button"
          >
            <span className="kpi-heading"><span>{stat.label}</span><i aria-hidden="true">→</i></span>
            <strong>{isLoading ? <span className="kpi-loading" /> : stat.value}</strong>
            <small>{stat.note}</small>
          </button>
        ))}
      </div>

      <div className="operations-grid">
        <section className="operations-panel operations-attention">
          <header>
            <div><span className="eyebrow">{tr("Ưu tiên", "Priority")}</span><h2>{tr("Cần xử lý", "Needs attention")}</h2></div>
            <button onClick={() => navigate("/admin/requests")} type="button">{tr("Mở pipeline", "Open pipeline")}</button>
          </header>
          <div className="attention-list">
            <button onClick={() => navigate("/admin/requests")} type="button">
              <span className="attention-icon warning">RQ</span>
              <div><strong>{stats?.pendingRentalRequests ?? 0} {tr("yêu cầu thuê mới", "new leasing requests")}</strong><small>{tr("Đang chờ duyệt hoặc phản hồi", "Awaiting review or response")}</small></div>
              <b aria-hidden="true">→</b>
            </button>
            <button onClick={() => navigate("/admin/appointments")} type="button">
              <span className="attention-icon info">AP</span>
              <div><strong>{stats?.pendingAppointments ?? 0} {tr("lịch hẹn cần xác nhận", "appointments to confirm")}</strong><small>{tr("Kiểm tra lịch và phản hồi khách hàng", "Review times and respond to customers")}</small></div>
              <b aria-hidden="true">→</b>
            </button>
            <button onClick={() => navigate("/admin/contracts")} type="button">
              <span className="attention-icon danger">CT</span>
              <div><strong>{stats?.expiringContracts?.length ?? 0} {tr("hợp đồng sắp hết hạn", "contracts expiring soon")}</strong><small>{tr("Trong vòng 30 ngày", "Within 30 days")}</small></div>
              <b aria-hidden="true">→</b>
            </button>
          </div>
        </section>

        <section className="operations-panel">
          <header>
            <div><span className="eyebrow">{tr("Danh mục", "Portfolio")}</span><h2>{tr("Trạng thái văn phòng", "Office status")}</h2></div>
            <button onClick={() => navigate("/admin/offices")} type="button">{tr("Quản lý", "Manage")}</button>
          </header>
          <div className="status-distribution">
            {officeStatuses.map((status) => {
              const count = stats?.officeStatusCounts?.[status] ?? 0;
              const percentage = totalOffices > 0 ? Math.round((count / totalOffices) * 100) : 0;
              return (
                <div key={status}>
                  <div><span>{formatStatus(status, language)}</span><strong>{count}</strong></div>
                  <div className="status-progress" role="progressbar" aria-label={formatStatus(status, language)} aria-valuemax={100} aria-valuemin={0} aria-valuenow={percentage}>
                    <i className={`status-fill status-${status.toLowerCase()}`} style={{ width: `${percentage}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="operations-panel">
          <header>
            <div><span className="eyebrow">{tr("Lịch", "Schedule")}</span><h2>{tr("Lịch hẹn hôm nay", "Today's appointments")}</h2></div>
            <button onClick={() => navigate("/admin/appointments")} type="button">{tr("Xem tất cả", "View all")}</button>
          </header>
          <div className="compact-agenda">
            {(stats?.todayAppointments ?? []).map((appointment) => (
              <article key={appointment.id}>
                <time>{new Intl.DateTimeFormat(language === "vi" ? "vi-VN" : "en-US", { hour: "2-digit", minute: "2-digit" }).format(new Date(appointment.scheduledAt))}</time>
                <div><strong>{appointment.customerName}</strong><span>{appointment.officeTitle || tr("Lịch xem văn phòng", "Office viewing")}</span></div>
                <span className={`status status-${appointment.status.toLowerCase()}`}>{formatStatus(appointment.status, language)}</span>
              </article>
            ))}
            {!isLoading && !stats?.todayAppointments?.length && <div className="admin-empty-state"><strong>{tr("Hôm nay chưa có lịch hẹn", "No appointments today")}</strong></div>}
          </div>
        </section>

        <section className="operations-panel">
          <header>
            <div><span className="eyebrow">{tr("Cảnh báo", "Alerts")}</span><h2>{tr("Hợp đồng sắp hết hạn", "Expiring contracts")}</h2></div>
            <button onClick={() => navigate("/admin/contracts")} type="button">{tr("Quản lý", "Manage")}</button>
          </header>
          <div className="contract-alert-list">
            {(stats?.expiringContracts ?? []).map((contract) => (
              <article key={contract.id}>
                <div><strong>{formatContractTitle(contract.title, language)}</strong><span>{contract.officeTitle || tr("Văn phòng thuê", "Leased office")} · {contract.customerName || tr("Khách hàng", "Customer")}</span></div>
                <time>{contract.endDate ? formatDate(contract.endDate, language) : "-"}</time>
              </article>
            ))}
            {!isLoading && !stats?.expiringContracts?.length && <div className="admin-empty-state"><strong>{tr("Không có hợp đồng hết hạn trong 30 ngày", "No contracts expire within 30 days")}</strong></div>}
          </div>
        </section>
      </div>

      <section className="report-center">
        <div>
          <span className="eyebrow">CSV</span>
          <h2>{tr("Xuất dữ liệu vận hành", "Operations data export")}</h2>
          <p>{tr("Tải dữ liệu văn phòng hoặc khách hàng để đối soát và lưu trữ.", "Download office or customer data for review and archiving.")}</p>
        </div>
        <div>
          <button onClick={() => void downloadReport("offices")} type="button">{tr("Xuất văn phòng", "Export offices")}</button>
          <button onClick={() => void downloadReport("customers")} type="button">{tr("Xuất khách hàng", "Export customers")}</button>
        </div>
      </section>
    </section>
  );
}
