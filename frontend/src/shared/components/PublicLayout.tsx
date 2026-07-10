import { ReactNode } from "react";
import { PublicFooter } from "./PublicFooter";
import { PublicHeader } from "./PublicHeader";

export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="public-site">
      <PublicHeader />
      {children}
      <PublicFooter />
    </div>
  );
}
