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
  const isPreviewMode = import.meta.env.DEV && import.meta.env.VITE_BYPASS_ADMIN_AUTH === "true";
  const pageTitles: Record<string, string> = {
    "/admin": "Tổng quan",
    "/admin/offices": "Quản lý văn phòng",
    "/admin/requests": "Yêu cầu thuê",
    "/admin/appointments": "Lịch xem văn phòng",
    "/admin/contracts": "Hợp đồng",
    "/admin/customers": "Khách hàng"
  };

  return (
    <div className="admin-shell">
      <Sidebar activePath={activePath} />
      <div className="admin-main">
        <header className="admin-header">
          <div className="admin-header-context">
            <span className="eyebrow">Cloud Office Admin</span>
            <strong>{pageTitles[activePath] ?? "Quản trị hệ thống"}</strong>
          </div>
          <div className="admin-header-account">
            {isPreviewMode && <span className="admin-preview-badge">Dữ liệu thử nghiệm</span>}
            <span className="admin-avatar" aria-hidden="true">AD</span>
            <div className="admin-account-copy">
              <strong>{user?.email ?? "Quản trị viên"}</strong>
              <span>{isPreviewMode ? "Chế độ xem trước" : "Administrator"}</span>
            </div>
            <button
              aria-label={isPreviewMode ? "Về trang chủ" : "Đăng xuất"}
              onClick={() => {
                if (!isPreviewMode) logout();
                navigate(isPreviewMode ? "/" : "/login");
              }}
              title={isPreviewMode ? "Về trang chủ" : "Đăng xuất"}
              type="button"
            >
              {isPreviewMode ? "Trang chủ" : "Đăng xuất"}
            </button>
          </div>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}
