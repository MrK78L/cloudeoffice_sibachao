import { navigate } from "../app/router";
import { OfficeDetail, useOffice } from "../features/offices";
import { RentalRequestForm } from "../features/rental-requests";
import { AppointmentForm } from "../features/appointments";

export function OfficeDetailPage({ officeId }: { officeId: string }) {
  const { item: office, isLoading, error } = useOffice(officeId);

  return (
    <main className="app-shell">
      <button className="link-button" onClick={() => navigate("/offices")} type="button">
        Quay lại danh sách
      </button>
      {isLoading && <div className="detail-loading skeleton-stack"><span /><span /><span /></div>}
      {!isLoading && error && (
        <div className="empty-state detail-empty-state">
          <strong>Không tìm thấy văn phòng</strong>
          <p>Văn phòng có thể đã ngừng hoạt động hoặc đường dẫn không còn hợp lệ.</p>
          <button className="link-button" onClick={() => navigate("/offices")} type="button">Xem danh sách văn phòng</button>
        </div>
      )}
      {!isLoading && office && (
        <>
          <section className="detail-layout">
            <OfficeDetail office={office} />
            <RentalRequestForm officeId={office.id} />
          </section>
          <section className="appointment-band">
            <AppointmentForm officeId={office.id} />
          </section>
        </>
      )}
    </main>
  );
}
