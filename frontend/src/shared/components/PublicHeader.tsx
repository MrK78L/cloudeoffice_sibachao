import { useEffect, useState } from "react";
import { navigate } from "../../app/router";
import { getMyProfile } from "../../features/account/api/accountApi";
import { useAuth } from "../../features/auth";
import { LanguageToggle, useLanguage } from "../../features/i18n";

export function PublicHeader() {
  const { isAdmin, isAuthenticated, logout, user } = useAuth();
  const { tr } = useLanguage();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [avatarDataUrl, setAvatarDataUrl] = useState("");
  const [displayName, setDisplayName] = useState("");
  const path = window.location.pathname;
  const fallbackInitial = (displayName || user?.name || user?.email || "U").trim().charAt(0).toUpperCase();

  useEffect(() => {
    setIsMenuOpen(false);
  }, [path]);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      if (!isAuthenticated) {
        setAvatarDataUrl("");
        setDisplayName("");
        return;
      }

      try {
        const response = await getMyProfile();
        if (!active) return;
        setAvatarDataUrl(response.item.avatarUrl || response.item.avatarDataUrl || user?.picture || "");
        setDisplayName(response.item.displayName || user?.name || "");
      } catch {
        if (!active) return;
        setAvatarDataUrl(user?.picture || "");
        setDisplayName(user?.name || "");
      }
    }

    void loadProfile();
    window.addEventListener("orms-profile-updated", loadProfile);

    return () => {
      active = false;
      window.removeEventListener("orms-profile-updated", loadProfile);
    };
  }, [isAuthenticated, user?.name, user?.picture]);

  function go(pathname: string) {
    setIsMenuOpen(false);
    navigate(pathname);
  }

  function scrollTo(selector: string) {
    setIsMenuOpen(false);
    document.querySelector(selector)?.scrollIntoView({ behavior: "smooth" });
  }

  function handleLogout() {
    setIsMenuOpen(false);
    logout();
    navigate("/");
  }

  return (
    <header className="public-header">
      <button className="public-brand" onClick={() => go("/")} type="button">
        <span>OR</span>
        <strong>ORMS</strong>
      </button>
      <nav className={isMenuOpen ? "public-nav open" : "public-nav"} aria-label={tr("Điều hướng khách hàng", "Customer navigation")}>
        <button className={path.startsWith("/offices") ? "active" : ""} onClick={() => go("/offices")} type="button">
          {tr("Tìm văn phòng", "Find offices")}
        </button>
        <button onClick={() => scrollTo("#solutions")} type="button">
          {tr("Về chúng tôi", "About us")}
        </button>
        <button onClick={() => scrollTo(".public-footer")} type="button">
          {tr("Liên hệ", "Contact")}
        </button>
        {isAuthenticated ? (
          <>
            <button className="mobile-account-link" onClick={() => go("/my-appointments")} type="button">{tr("Lịch hẹn", "Appointments")}</button>
            <button className="mobile-account-link" onClick={() => go("/my-contracts")} type="button">{tr("Hợp đồng", "Contracts")}</button>
            <button className="mobile-account-link" onClick={() => go("/profile")} type="button">{tr("Hồ sơ cá nhân", "Profile")}</button>
            <button className="mobile-account-link public-mobile-logout" onClick={handleLogout} type="button">{tr("Đăng xuất", "Sign out")}</button>
          </>
        ) : (
          <button className="mobile-account-link" onClick={() => go("/login")} type="button">{tr("Đăng nhập", "Sign in")}</button>
        )}
        {isAdmin && <button onClick={() => go("/admin")} type="button">Admin</button>}
      </nav>
      <LanguageToggle />
      {isAuthenticated ? (
        <div className="public-account-actions">
          <button className="public-login" onClick={() => go("/my-appointments")} type="button">
            {tr("Lịch hẹn", "Appointments")}
          </button>
          <button className="public-login" onClick={() => go("/my-contracts")} type="button">
            {tr("Hợp đồng", "Contracts")}
          </button>
          <button className="public-avatar-button" onClick={() => go("/profile")} title={tr("Hồ sơ cá nhân", "Profile")} type="button">
            {avatarDataUrl ? <img alt="" src={avatarDataUrl} /> : <span>{fallbackInitial}</span>}
          </button>
          <button className="public-logout" onClick={handleLogout} type="button">
            {tr("Đăng xuất", "Sign out")}
          </button>
        </div>
      ) : (
        <button className="public-login" onClick={() => go("/login")} type="button">
          {tr("Đăng nhập", "Sign in")}
        </button>
      )}
      <button className="public-cta" onClick={() => go("/offices")} type="button">
        {tr("Yêu cầu thuê", "Request a lease")}
      </button>
      <button
        aria-expanded={isMenuOpen}
        aria-label={tr("Mở menu", "Open menu")}
        className="public-menu-button"
        onClick={() => setIsMenuOpen((value) => !value)}
        type="button"
      >
        <span />
        <span />
      </button>
    </header>
  );
}
