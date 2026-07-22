import { ReactNode } from "react";
import { LoginPage } from "../../../pages/LoginPage";
import { useAuth } from "../../auth";
import { useLanguage } from "../../i18n";

export function AdminRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isAdmin } = useAuth();
  const { tr } = useLanguage();
  const isPreviewMode = import.meta.env.DEV && import.meta.env.VITE_BYPASS_ADMIN_AUTH === "true";

  if (isPreviewMode) {
    return <>{children}</>;
  }

  if (!isAuthenticated) {
    return <LoginPage reason={tr("Vui lòng đăng nhập để tiếp tục vào khu vực quản trị.", "Please sign in to access the administration area.")} />;
  }

  if (!isAdmin) {
    return (
      <main className="app-shell">
        <div className="notice danger">
          {tr("Tài khoản của bạn chưa được cấp quyền quản trị. Vui lòng liên hệ người phụ trách hệ thống.", "Your account does not have administrator access. Please contact the system owner.")}
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
