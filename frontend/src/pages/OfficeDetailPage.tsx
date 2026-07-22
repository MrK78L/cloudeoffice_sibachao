import { navigate } from "../app/router";
import { OfficeDetail, useOffice } from "../features/offices";
import { RentalRequestForm } from "../features/rental-requests";
import { AppointmentForm } from "../features/appointments";
import { useLanguage } from "../features/i18n";

export function OfficeDetailPage({ officeId }: { officeId: string }) {
  const { tr } = useLanguage();
  const { item: office, isLoading, error } = useOffice(officeId);

  return (
    <main className="app-shell office-detail-page">
      <nav className="office-breadcrumb" aria-label={tr("Điều hướng trang văn phòng", "Office page navigation")}>
        <button onClick={() => navigate("/offices")} type="button"><span aria-hidden="true">←</span> {tr("Danh sách văn phòng", "Office listings")}</button>
        {office && <span aria-current="page">{office.title}</span>}
      </nav>
      {isLoading && <div className="detail-loading skeleton-stack"><span /><span /><span /></div>}
      {!isLoading && error && (
        <div className="empty-state detail-empty-state">
          <strong>{tr("Không tìm thấy văn phòng", "Office not found")}</strong>
          <p>{tr("Văn phòng có thể đã ngừng hoạt động hoặc đường dẫn không còn hợp lệ.", "The office may be inactive or this link is no longer valid.")}</p>
          <button className="link-button" onClick={() => navigate("/offices")} type="button">{tr("Xem danh sách văn phòng", "View office list")}</button>
        </div>
      )}
      {!isLoading && office && (
        <>
          <section className="detail-layout">
            <OfficeDetail office={office} />
            <aside className="office-detail-actions">
              <div className="office-enquiry-intro">
                <p className="eyebrow">{tr("Tư vấn thuê", "Leasing enquiry")}</p>
                <h2>{tr("Quan tâm văn phòng này?", "Interested in this office?")}</h2>
                <p>{tr("Gửi thông tin để đội tư vấn liên hệ và xác nhận nhu cầu của bạn.", "Share your details and our leasing team will confirm your requirements.")}</p>
              </div>
              {["AVAILABLE", "RESERVED"].includes(office.status)
                ? <RentalRequestForm officeId={office.id} />
                : (
                  <div className="office-unavailable-notice">
                    <strong>{tr("Văn phòng hiện chưa nhận yêu cầu thuê", "This office is not accepting leasing requests")}</strong>
                    <p>{tr("Bạn vẫn có thể đặt lịch để trao đổi về các lựa chọn tương tự.", "You can still schedule a consultation about similar options.")}</p>
                  </div>
                )}
            </aside>
          </section>
          <section className="appointment-band">
            <AppointmentForm officeId={office.id} />
          </section>
        </>
      )}
    </main>
  );
}
