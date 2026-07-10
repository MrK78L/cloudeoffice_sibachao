import { ReactNode } from "react";
import { LoginPage } from "../../../pages/LoginPage";
import { useAuth } from "../../auth";

export function AdminRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isAdmin } = useAuth();

  if (!isAuthenticated) {
    return <LoginPage reason="Vui lòng đăng nhập để tiếp tục vào khu vực quản trị." />;
  }

  if (!isAdmin) {
    return (
      <main className="app-shell">
        <div className="notice danger">
          Tài khoản của bạn chưa được cấp quyền quản trị. Vui lòng liên hệ người phụ trách hệ thống.
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
