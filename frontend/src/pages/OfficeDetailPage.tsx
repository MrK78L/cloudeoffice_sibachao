import { useMemo } from "react";
import { navigate } from "../app/router";
import { OfficeDetail, useOffices } from "../features/offices";
import { RentalRequestForm } from "../features/rental-requests";

export function OfficeDetailPage({ officeId }: { officeId: string }) {
  const { items, error } = useOffices();
  const office = useMemo(() => items.find((item) => item.id === officeId), [items, officeId]);

  return (
    <main className="app-shell">
      <button className="link-button" onClick={() => navigate("/offices")} type="button">
        Quay lại danh sách
      </button>
      {error && <div className="notice">Chưa tải được thông tin văn phòng. Vui lòng thử lại sau.</div>}
      <section className="detail-layout">
        <OfficeDetail office={office} />
        <RentalRequestForm officeId={office?.id} />
      </section>
    </main>
  );
}
