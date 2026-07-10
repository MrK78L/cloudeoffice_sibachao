import { navigate } from "../../../../app/router";

const items = [
  { path: "/admin", label: "Dashboard", icon: "01" },
  { path: "/admin/offices", label: "Văn phòng", icon: "02" },
  { path: "/admin/requests", label: "Yêu cầu thuê", icon: "03" },
  { path: "/admin/contracts", label: "Hợp đồng", icon: "04" },
  { path: "/admin/customers", label: "Khách hàng", icon: "05" }
];

export function Sidebar({ activePath }: { activePath: string }) {
  return (
    <aside className="admin-sidebar">
      <div className="admin-brand">
        <span>CO</span>
        <strong>Cloud Office</strong>
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
