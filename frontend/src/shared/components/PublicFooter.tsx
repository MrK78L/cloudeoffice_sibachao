import { navigate } from "../../app/router";
import { useLanguage } from "../../features/i18n";

export function PublicFooter() {
  const { tr } = useLanguage();
  return (
    <footer className="public-footer">
      <div className="ruler-divider" aria-hidden="true" />
      <section className="footer-cta">
        <div>
          <p className="eyebrow">ORMS Workspace</p>
          <h2>{tr("Sẵn sàng chuẩn hóa quy trình thuê văn phòng?", "Ready to streamline your office leasing process?")}</h2>
          <p>{tr("Tìm mặt bằng phù hợp, gửi yêu cầu thuê và quản lý hợp đồng trên một nền tảng rõ ràng, đáng tin cậy.", "Find the right space, submit leasing requests and manage contracts on one reliable platform.")}</p>
        </div>
        <button onClick={() => navigate("/offices")} type="button">{tr("Yêu cầu thuê", "Request a lease")}</button>
      </section>
      <section className="footer-grid">
        <div className="footer-brand">
          <span>OR</span>
          <div>
            <strong>ORMS</strong>
            <p>{tr("Nền tảng quản lý và cho thuê văn phòng trực tuyến cho doanh nghiệp tại TP.HCM.", "An online office leasing and management platform for businesses in Ho Chi Minh City.")}</p>
          </div>
        </div>
        <div>
          <h3>{tr("Danh mục", "Locations")}</h3>
          <button onClick={() => navigate("/offices")} type="button">{tr("Văn phòng Quận 1", "District 1 offices")}</button>
          <button onClick={() => navigate("/offices")} type="button">{tr("Văn phòng Thủ Đức", "Thu Duc offices")}</button>
          <button onClick={() => navigate("/offices")} type="button">{tr("Xem tất cả", "View all")}</button>
        </div>
        <div>
          <h3>{tr("Hỗ trợ", "Support")}</h3>
          <span>{tr("Câu hỏi thường gặp", "Frequently asked questions")}</span>
          <span>{tr("Hướng dẫn thuê văn phòng", "Office leasing guide")}</span>
          <span>{tr("Điều khoản dịch vụ", "Terms of service")}</span>
          <span>{tr("Chính sách bảo mật", "Privacy policy")}</span>
        </div>
        <div>
          <h3>{tr("Liên hệ", "Contact")}</h3>
          <span className="mono-text">1900 1000</span>
          <span>contact@orms.vn</span>
          <span>{tr("TP.HCM, Việt Nam", "Ho Chi Minh City, Vietnam")}</span>
          <span>{tr("Thứ 2 - Thứ 6, 08:30 - 17:30", "Monday - Friday, 08:30 - 17:30")}</span>
        </div>
      </section>
      <div className="footer-bottom">
        <span>© 2026 ORMS. All rights reserved.</span>
        <span>Facebook · LinkedIn · Zalo</span>
      </div>
    </footer>
  );
}
