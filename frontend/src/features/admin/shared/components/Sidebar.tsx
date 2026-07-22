import { navigate } from "../../../../app/router";
import { useLanguage } from "../../../i18n";

type SidebarProps = {
  activePath: string;
  collapsed: boolean;
  onToggle: () => void;
};

export function Sidebar({ activePath, collapsed, onToggle }: SidebarProps) {
  const { tr } = useLanguage();
  const items = [
    { path: "/admin", label: tr("Tổng quan", "Overview"), icon: "DB" },
    { path: "/admin/offices", label: tr("Văn phòng", "Offices"), icon: "OF" },
    { path: "/admin/requests", label: tr("Yêu cầu thuê", "Requests"), icon: "RQ" },
    { path: "/admin/appointments", label: tr("Lịch hẹn", "Appointments"), icon: "AP" },
    { path: "/admin/contracts", label: tr("Hợp đồng", "Contracts"), icon: "CT" },
    { path: "/admin/customers", label: tr("Khách hàng", "Customers"), icon: "CU" }
  ];
  return (
    <aside className="admin-sidebar">
      <div className="admin-brand">
        <span>CO</span>
        <div>
          <strong>Cloud Office</strong>
          <small>Management</small>
        </div>
        <button aria-label={collapsed ? tr("Mở rộng thanh bên", "Expand sidebar") : tr("Thu gọn thanh bên", "Collapse sidebar")} className="admin-sidebar-toggle" onClick={onToggle} title={collapsed ? tr("Mở rộng", "Expand") : tr("Thu gọn", "Collapse")} type="button">
          {collapsed ? ">" : "<"}
        </button>
      </div>
      <nav>
        {items.map((item) => (
          <button
            className={activePath === item.path ? "active" : ""}
            key={item.path}
            onClick={() => navigate(item.path)}
            type="button"
          >
            <span>{item.icon}</span>
            <span className="admin-nav-label">{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
