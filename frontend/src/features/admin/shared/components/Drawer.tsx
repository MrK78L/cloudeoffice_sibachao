import { ReactNode, useEffect } from "react";
import { useLanguage } from "../../../i18n";

type DrawerProps = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
};

export function Drawer({ open, title, description, onClose, children, wide = false }: DrawerProps) {
  const { tr } = useLanguage();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.body.classList.add("drawer-open");
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.classList.remove("drawer-open");
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="admin-drawer-layer" role="presentation">
      <button aria-label={tr("Đóng bảng chỉnh sửa", "Close editor")} className="admin-drawer-backdrop" onClick={onClose} type="button" />
      <aside aria-modal="true" className={`admin-drawer ${wide ? "admin-drawer-wide" : ""}`} role="dialog">
        <header>
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button aria-label={tr("Đóng", "Close")} className="admin-drawer-close" onClick={onClose} title={tr("Đóng", "Close")} type="button">×</button>
        </header>
        <div className="admin-drawer-content">{children}</div>
      </aside>
    </div>
  );
}
