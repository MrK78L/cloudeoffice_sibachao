import { navigate } from "../../app/router";

export function PublicFooter() {
  return (
    <footer className="public-footer">
      <div className="ruler-divider" aria-hidden="true" />
      <section className="footer-cta">
        <div>
          <p className="eyebrow">ORMS Workspace</p>
          <h2>Sẵn sàng chuẩn hóa quy trình thuê văn phòng?</h2>
          <p>Tìm mặt bằng phù hợp, gửi yêu cầu thuê và quản lý hợp đồng trên một nền tảng rõ ràng, đáng tin cậy.</p>
        </div>
        <button onClick={() => navigate("/offices")} type="button">Yêu cầu thuê</button>
      </section>
      <section className="footer-grid">
        <div className="footer-brand">
          <span>OR</span>
          <div>
            <strong>ORMS</strong>
            <p>Nền tảng quản lý và cho thuê văn phòng trực tuyến cho doanh nghiệp tại TP.HCM.</p>
          </div>
        </div>
        <div>
          <h3>Danh mục</h3>
          <button onClick={() => navigate("/offices")} type="button">Văn phòng Quận 1</button>
          <button onClick={() => navigate("/offices")} type="button">Văn phòng Thủ Đức</button>
          <button onClick={() => navigate("/offices")} type="button">Xem tất cả</button>
        </div>
        <div>
          <h3>Hỗ trợ</h3>
          <span>Câu hỏi thường gặp</span>
          <span>Hướng dẫn thuê văn phòng</span>
          <span>Điều khoản dịch vụ</span>
          <span>Chính sách bảo mật</span>
        </div>
        <div>
          <h3>Liên hệ</h3>
          <span className="mono-text">1900 1000</span>
          <span>contact@orms.vn</span>
          <span>TP.HCM, Việt Nam</span>
          <span>Thứ 2 - Thứ 6, 08:30 - 17:30</span>
        </div>
      </section>
      <div className="footer-bottom">
        <span>© 2026 ORMS. All rights reserved.</span>
        <span>Facebook · LinkedIn · Zalo</span>
      </div>
    </footer>
  );
}
