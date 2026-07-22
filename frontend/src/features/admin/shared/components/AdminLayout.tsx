import { FormEvent, ReactNode, useState } from "react";
import { navigate } from "../../../../app/router";
import { useAuth } from "../../../auth";
import { LanguageToggle, useLanguage } from "../../../i18n";
import { Sidebar } from "./Sidebar";

type AdminLayoutProps = {
  activePath: string;
  children: ReactNode;
};

export function AdminLayout({ activePath, children }: AdminLayoutProps) {
  const { user, logout } = useAuth();
  const { tr } = useLanguage();
  const isPreviewMode = import.meta.env.DEV && import.meta.env.VITE_BYPASS_ADMIN_AUTH === "true";
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [search, setSearch] = useState("");
  const pageTitles: Record<string, string> = {
    "/admin": tr("Tổng quan", "Overview"),
    "/admin/offices": tr("Quản lý văn phòng", "Office management"),
    "/admin/requests": tr("Yêu cầu thuê", "Lease requests"),
    "/admin/appointments": tr("Lịch xem văn phòng", "Office appointments"),
    "/admin/contracts": tr("Hợp đồng", "Contracts"),
    "/admin/customers": tr("Khách hàng", "Customers")
  };

  return (
    <div className={`admin-shell ${sidebarCollapsed ? "admin-shell-collapsed" : ""}`}>
      <Sidebar activePath={activePath} collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((value) => !value)} />
      <div className="admin-main">
        <header className="admin-header">
          <div className="admin-header-context">
            <span className="eyebrow">Cloud Office Admin</span>
            <strong>{pageTitles[activePath] ?? tr("Quản trị hệ thống", "System administration")}</strong>
          </div>
          <form
            className="admin-global-search"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              window.dispatchEvent(new CustomEvent("admin-global-search", { detail: search.trim() }));
            }}
          >
            <span aria-hidden="true">⌕</span>
            <input
              aria-label={tr("Tìm trong trang hiện tại", "Search this page")}
              onChange={(event) => {
                setSearch(event.target.value);
                window.dispatchEvent(new CustomEvent("admin-global-search", { detail: event.target.value.trim() }));
              }}
              placeholder={tr("Tìm trong trang hiện tại", "Search this page")}
              value={search}
            />
          </form>
          <div className="admin-header-account">
            {isPreviewMode && <span className="admin-preview-badge">{tr("Dữ liệu thử nghiệm", "Preview data")}</span>}
            <LanguageToggle />
            <span className="admin-avatar" aria-hidden="true">{(user?.email ?? "AD").slice(0, 2).toUpperCase()}</span>
            <div className="admin-account-copy">
              <strong>{user?.email ?? tr("Quản trị viên", "Administrator")}</strong>
              <span>{isPreviewMode ? tr("Chế độ xem trước", "Preview mode") : "Administrator"}</span>
            </div>
            <button
              aria-label={isPreviewMode ? tr("Về trang chủ", "Go to homepage") : tr("Đăng xuất", "Sign out")}
              onClick={() => {
                if (!isPreviewMode) logout();
                navigate(isPreviewMode ? "/" : "/login");
              }}
              title={isPreviewMode ? tr("Về trang chủ", "Go to homepage") : tr("Đăng xuất", "Sign out")}
              type="button"
            >
              {isPreviewMode ? tr("Trang chủ", "Home") : tr("Đăng xuất", "Sign out")}
            </button>
          </div>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}
