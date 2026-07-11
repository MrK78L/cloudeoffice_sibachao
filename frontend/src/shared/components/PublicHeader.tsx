import { useEffect, useState } from "react";
import { navigate } from "../../app/router";
import { getMyProfile } from "../../features/account/api/accountApi";
import { useAuth } from "../../features/auth";

export function PublicHeader() {
  const { isAdmin, isAuthenticated, user } = useAuth();
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

  return (
    <header className="public-header">
      <button className="public-brand" onClick={() => go("/")} type="button">
        <span>OR</span>
        <strong>ORMS</strong>
      </button>
      <nav className={isMenuOpen ? "public-nav open" : "public-nav"} aria-label="Điều hướng khách hàng">
        <button className={path.startsWith("/offices") ? "active" : ""} onClick={() => go("/offices")} type="button">
          Tìm văn phòng
        </button>
        <button onClick={() => scrollTo("#solutions")} type="button">
          Về chúng tôi
        </button>
        <button onClick={() => scrollTo(".public-footer")} type="button">
          Liên hệ
        </button>
        {isAdmin && <button onClick={() => go("/admin")} type="button">Admin</button>}
      </nav>
      {isAuthenticated ? (
        <div className="public-account-actions">
          <button className="public-login" onClick={() => go("/my-appointments")} type="button">
            Lịch hẹn
          </button>
          <button className="public-login" onClick={() => go("/my-contracts")} type="button">
            Hợp đồng
          </button>
          <button className="public-avatar-button" onClick={() => go("/profile")} title="Hồ sơ cá nhân" type="button">
            {avatarDataUrl ? <img alt="" src={avatarDataUrl} /> : <span>{fallbackInitial}</span>}
          </button>
        </div>
      ) : (
        <button className="public-login" onClick={() => go("/login")} type="button">
          Đăng nhập
        </button>
      )}
      <button className="public-cta" onClick={() => go("/offices")} type="button">
        Yêu cầu thuê
      </button>
      <button
        aria-expanded={isMenuOpen}
        aria-label="Mở menu"
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
