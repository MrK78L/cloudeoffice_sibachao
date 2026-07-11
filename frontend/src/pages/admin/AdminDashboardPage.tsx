import { useState } from "react";
import { downloadAdminReport, getAdminStats } from "../../features/admin/api/adminApi";
import { useAdminQuery } from "../../features/admin/hooks/useAdminQuery";
import { navigate } from "../../app/router";

export function AdminDashboardPage() {
  const { data, isLoading, error } = useAdminQuery(getAdminStats, []);
  const stats = data?.item;
  const [reportError, setReportError] = useState("");

  async function downloadReport(type: "offices" | "customers" | "revenue") {
    setReportError("");
    try {
      await downloadAdminReport(type);
    } catch {
      setReportError("Không thể xuất báo cáo lúc này. Vui lòng thử lại.");
    }
  }

  const cards = [
    { label: "Văn phòng", value: stats?.offices ?? 0, tone: "blue" },
    { label: "Yêu cầu chờ duyệt", value: stats?.pendingRentalRequests ?? 0, tone: "orange" },
    { label: "Hợp đồng hiệu lực", value: stats?.activeContracts ?? 0, tone: "green" },
    { label: "Khách hàng", value: stats?.customers ?? 0, tone: "violet" }
  ];

  return (
    <section className="admin-page">
      <div className="admin-page-title">
        <p className="eyebrow">Overview</p>
        <h1>Dashboard tổng quan</h1>
      </div>

      {error && <div className="notice danger">{error}</div>}
      {reportError && <div className="notice danger">{reportError}</div>}

      <div className="stats-grid">
        {cards.map((stat) => (
          <article className={`stat-card stat-${stat.tone}`} key={stat.label}>
            <span>{stat.label}</span>
            <strong>{isLoading ? "..." : stat.value}</strong>
            <small>Dữ liệu từ backend DynamoDB</small>
          </article>
        ))}
      </div>

      <div className="admin-quick-actions" aria-label="Thao tác nhanh">
        <span>Thao tác nhanh</span>
        <button onClick={() => navigate("/admin/offices")} type="button">Thêm văn phòng</button>
        <button onClick={() => navigate("/admin/requests")} type="button">Duyệt yêu cầu</button>
        <button onClick={() => navigate("/admin/contracts")} type="button">Quản lý hợp đồng</button>
        <span>Báo cáo</span>
        <button onClick={() => void downloadReport("offices")} type="button">CSV văn phòng</button>
        <button onClick={() => void downloadReport("customers")} type="button">CSV khách hàng</button>
        <button onClick={() => void downloadReport("revenue")} type="button">CSV doanh thu</button>
      </div>

      <div className="bento-grid">
        <article className="bento-card bento-large">
          <div>
            <p className="eyebrow">Tình trạng vận hành</p>
            <h2>{isLoading ? "Đang tải" : `${stats?.pendingRentalRequests ?? 0} yêu cầu cần xử lý`}</h2>
            <p>Dữ liệu dashboard đang được tổng hợp trực tiếp từ API admin.</p>
          </div>
          <div className="bar-chart" aria-hidden="true">
            <span style={{ height: "44%" }} />
            <span style={{ height: "68%" }} />
            <span style={{ height: "52%" }} />
            <span style={{ height: "78%" }} />
            <span style={{ height: "84%" }} />
            <span style={{ height: "64%" }} />
          </div>
        </article>
        <article className="bento-card">
          <p className="eyebrow">Tỷ lệ hợp đồng</p>
          <div className="radial-meter">
            <span>{stats?.offices ? Math.round(((stats.activeContracts ?? 0) / stats.offices) * 100) : 0}%</span>
          </div>
        </article>
        <article className="bento-card">
          <p className="eyebrow">Cần xử lý</p>
          <ul className="activity-list">
            <li><span className="status-dot pending" />{stats?.pendingRentalRequests ?? 0} yêu cầu thuê mới</li>
            <li><span className="status-dot success" />{stats?.activeContracts ?? 0} hợp đồng đang hiệu lực</li>
            <li><span className="status-dot danger" />Theo dõi phòng đã ngừng hoạt động ở mục văn phòng</li>
          </ul>
        </article>
      </div>
    </section>
  );
}
