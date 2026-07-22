import { ReactNode, useEffect, useMemo, useState } from "react";
import { AdminRoute } from "../features/admin/shared/AdminRoute";
import { AdminLayout } from "../features/admin/shared/components/AdminLayout";
import { useAuth } from "../features/auth";
import { AdminContractsPage } from "../pages/admin/AdminContractsPage";
import { AdminCustomersPage } from "../pages/admin/AdminCustomersPage";
import { AdminDashboardPage } from "../pages/admin/AdminDashboardPage";
import { AdminOfficesPage } from "../pages/admin/AdminOfficesPage";
import { AdminRequestsPage } from "../pages/admin/AdminRequestsPage";
import { AdminAppointmentsPage } from "../pages/admin/AdminAppointmentsPage";
import { AdminCustomerDetailPage } from "../pages/admin/AdminCustomerDetailPage";
import { HomePage } from "../pages/HomePage";
import { LoginPage } from "../pages/LoginPage";
import { MyContractsPage } from "../pages/MyContractsPage";
import { MyAppointmentsPage } from "../pages/MyAppointmentsPage";
import { OfficeDetailPage } from "../pages/OfficeDetailPage";
import { OfficeSearchPage } from "../pages/OfficeSearchPage";
import { ProfilePage } from "../pages/ProfilePage";
import { PublicLayout } from "../shared/components/PublicLayout";
import { useLanguage } from "../features/i18n";

export function navigate(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function useCurrentPath() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const handlePopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  return path;
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const { tr } = useLanguage();
  if (!isAuthenticated) {
    return <LoginPage reason={tr("Bạn cần đăng nhập để xem trang này.", "Please sign in to view this page.")} />;
  }
  return <>{children}</>;
}

export function AppRouter() {
  const path = useCurrentPath();

  const page = useMemo(() => {
    if (path === "/login") {
      return (
        <PublicLayout>
          <LoginPage />
        </PublicLayout>
      );
    }

    if (path === "/offices") {
      return (
        <PublicLayout>
          <OfficeSearchPage />
        </PublicLayout>
      );
    }

    if (path.startsWith("/offices/")) {
      return (
        <PublicLayout>
          <OfficeDetailPage officeId={decodeURIComponent(path.split("/")[2] ?? "")} />
        </PublicLayout>
      );
    }

    if (path === "/my-contracts") {
      return (
        <PublicLayout>
          <ProtectedRoute>
            <MyContractsPage />
          </ProtectedRoute>
        </PublicLayout>
      );
    }

    if (path === "/profile") {
      return (
        <PublicLayout>
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        </PublicLayout>
      );
    }

    if (path === "/my-appointments") {
      return (
        <PublicLayout>
          <ProtectedRoute>
            <MyAppointmentsPage />
          </ProtectedRoute>
        </PublicLayout>
      );
    }

    if (path.startsWith("/admin")) {
      const adminPath = path.replace(/^\/admin\/?/, "");
      return (
        <AdminRoute>
          <AdminLayout activePath={path}>
            {adminPath === "" && <AdminDashboardPage />}
            {adminPath === "offices" && <AdminOfficesPage />}
            {adminPath === "requests" && <AdminRequestsPage />}
            {adminPath === "appointments" && <AdminAppointmentsPage />}
            {adminPath === "contracts" && <AdminContractsPage />}
            {adminPath === "customers" && <AdminCustomersPage />}
            {adminPath.startsWith("customers/") && <AdminCustomerDetailPage customerId={decodeURIComponent(adminPath.split("/")[1] ?? "")} />}
            {!["", "offices", "requests", "appointments", "contracts", "customers"].includes(adminPath) && !adminPath.startsWith("customers/") && (
              <AdminDashboardPage />
            )}
          </AdminLayout>
        </AdminRoute>
      );
    }

    return (
      <PublicLayout>
        <HomePage />
      </PublicLayout>
    );
  }, [path]);

  return page;
}
