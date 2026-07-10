import { ReactNode } from "react";
import { navigate } from "../../../../app/router";
import { useAuth } from "../../../auth";
import { Sidebar } from "./Sidebar";

type AdminLayoutProps = {
  activePath: string;
  children: ReactNode;
};

export function AdminLayout({ activePath, children }: AdminLayoutProps) {
  const { user, logout } = useAuth();

  return (
    <div className="admin-shell">
      <Sidebar activePath={activePath} />
      <div className="admin-main">
        <header className="admin-header">
          <div>
            <span className="eyebrow">Admin workspace</span>
            <strong>{user?.email ?? user?.sub ?? "admin"}</strong>
          </div>
          <button
            onClick={() => {
              logout();
              navigate("/login");
            }}
            type="button"
          >
            Đăng xuất
          </button>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}
