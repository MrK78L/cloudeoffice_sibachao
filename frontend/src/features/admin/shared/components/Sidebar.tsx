import { navigate } from "../../../../app/router";

const items = [
  { path: "/admin", label: "Tổng quan", icon: "DB" },
  { path: "/admin/offices", label: "Văn phòng", icon: "VP" },
  { path: "/admin/requests", label: "Yêu cầu thuê", icon: "YC" },
  { path: "/admin/appointments", label: "Lịch hẹn", icon: "LH" },
  { path: "/admin/contracts", label: "Hợp đồng", icon: "HĐ" },
  { path: "/admin/customers", label: "Khách hàng", icon: "KH" }
];

export function Sidebar({ activePath }: { activePath: string }) {
  return (
    <aside className="admin-sidebar">
      <div className="admin-brand">
        <span>CO</span>
        <div>
          <strong>Cloud Office</strong>
          <small>Management</small>
        </div>
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
            {item.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}
