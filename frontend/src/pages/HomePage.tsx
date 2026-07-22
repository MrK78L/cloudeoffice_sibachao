import { FormEvent, useState } from "react";
import { navigate } from "../app/router";
import { useAuth } from "../features/auth";
import { useOffices, type Office } from "../features/offices";
import { formatCurrency, formatStatus } from "../shared/utils/format";
import { useLanguage } from "../features/i18n";

export function HomePage() {
  const { isAuthenticated } = useAuth();
  const { language, tr } = useLanguage();
  const { items: offices, isLoading } = useOffices({ status: "AVAILABLE" });
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState<Office["status"]>("AVAILABLE");
  const showcaseOffices = offices.slice(0, 3);

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    const query = keyword.trim();
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    params.set("status", status);
    navigate(`/offices?${params.toString()}`);
  }

  return (
    <main className="home-page">
      <section className="hero">
        <img
          alt={tr("Không gian văn phòng mở hiện đại", "Modern open-plan office")}
          className="hero-image"
          fetchPriority="high"
          src="https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1800&q=82"
        />
        <div className="hero-overlay" aria-hidden="true" />
        <div className="hero-content">
          <p className="eyebrow">Workspace booking platform</p>
          <h1>{tr("Không gian văn phòng cao cấp, sẵn sàng cho đội ngũ của bạn", "Premium office spaces, ready for your team")}</h1>
          <p>
            {tr("Tìm văn phòng phù hợp, gửi yêu cầu thuê và theo dõi hợp đồng trên một nền tảng an toàn, luôn cập nhật.", "Find the right office, submit leasing requests and track contracts on one secure, up-to-date platform.")}
          </p>
          <div className="hero-metrics" aria-label={tr("Chỉ số tin cậy", "Trust indicators")}>
            <span>{isLoading ? "..." : `${offices.length}+`} {tr("văn phòng khả dụng", "available offices")}</span>
            <span>{tr("Dữ liệu luôn được cập nhật", "Always up-to-date data")}</span>
          </div>
          <div className="hero-actions">
            <button onClick={() => navigate("/offices")} type="button">
              {tr("Khám phá văn phòng", "Explore offices")}
            </button>
            <button className="secondary" onClick={() => navigate(isAuthenticated ? "/my-contracts" : "/login")} type="button">
              {tr("Hợp đồng của tôi", "My contracts")}
            </button>
          </div>
        </div>
        <form className="floating-search" onSubmit={handleSearch}>
          <label>
            {tr("Từ khóa", "Keyword")}
            <input
              onChange={(event) => setKeyword(event.target.value)}
              placeholder={tr("Quận 1, Thủ Đức, Etown...", "District 1, Thu Duc, Etown...")}
              value={keyword}
            />
          </label>
          <label>
            {tr("Trạng thái", "Status")}
            <select onChange={(event) => setStatus(event.target.value as Office["status"])} value={status}>
              <option value="AVAILABLE">{tr("Đang trống", "Available")}</option>
              <option value="RESERVED">{tr("Đang giữ chỗ", "Reserved")}</option>
              <option value="LEASED">{tr("Đã thuê", "Leased")}</option>
            </select>
          </label>
          <button type="submit">{tr("Tìm ngay", "Search now")}</button>
        </form>
      </section>

      <section className="trust-strip" aria-label={tr("Chỉ số vận hành", "Service indicators")}>
        <article>
          <strong>{isLoading ? "..." : offices.length}</strong>
          <span>{tr("văn phòng sẵn sàng", "offices ready")}</span>
        </article>
        <article>
          <strong>{tr("An toàn", "Secure")}</strong>
          <span>{tr("bảo vệ tài khoản khách hàng", "customer account protection")}</span>
        </article>
        <article>
          <strong>{tr("Ổn định", "Reliable")}</strong>
          <span>{tr("sẵn sàng mở rộng khi nhu cầu tăng", "ready to scale with demand")}</span>
        </article>
      </section>

      <section className="enterprise-band" id="solutions">
        <div className="section-header">
          <p className="eyebrow">{tr("Giải pháp cho doanh nghiệp", "Business solutions")}</p>
          <h2>{tr("Một nền tảng cho toàn bộ vòng đời thuê văn phòng", "One platform for the entire office leasing lifecycle")}</h2>
          <p>
            {tr("Từ tìm kiếm mặt bằng, gửi yêu cầu thuê đến quản lý hồ sơ và hợp đồng, mọi dữ liệu được đồng bộ trong một trải nghiệm liền mạch.", "From office search and leasing requests to profiles and contracts, every workflow stays synchronized in one seamless experience.")}
          </p>
        </div>
        <div className="solution-grid">
          <article>
            <span>01</span>
            <h3>{tr("Tìm kiếm chính xác", "Accurate search")}</h3>
            <p>{tr("Danh sách văn phòng được cập nhật từ hệ thống quản lý, giúp khách hàng xem đúng tình trạng hiện tại.", "Office listings are updated from the management system so customers always see current availability.")}</p>
          </article>
          <article>
            <span>02</span>
            <h3>{tr("Quy trình thuê rõ ràng", "Clear leasing process")}</h3>
            <p>{tr("Khách đăng nhập, gửi yêu cầu thuê và theo dõi hồ sơ cá nhân.", "Customers sign in, submit leasing requests and track their records.")}</p>
          </article>
          <article>
            <span>03</span>
            <h3>{tr("Vận hành trên cloud", "Cloud operations")}</h3>
            <p>{tr("Đội vận hành quản lý văn phòng, yêu cầu thuê, khách hàng và hợp đồng trong dashboard.", "Operations teams manage offices, requests, customers and contracts from one dashboard.")}</p>
          </article>
        </div>
      </section>

      <section className="showcase-band">
        <div className="section-header">
          <p className="eyebrow">{tr("Danh mục nổi bật", "Featured spaces")}</p>
          <h2>{tr("Không gian làm việc được cập nhật trực tiếp từ hệ thống", "Workspaces updated directly from the system")}</h2>
        </div>
        <div className="office-showcase">
          {showcaseOffices.map((office, index) => (
            <article className={index === 0 ? "office-feature office-feature-large" : "office-feature"} key={office.id}>
              <img
                alt={office.title}
                src={office.imageUrl ?? "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1200&q=82"}
              />
              <div>
                <span className={`status status-${office.status.toLowerCase()}`}>{formatStatus(office.status, language)}</span>
                <h3>{office.title}</h3>
                <p>{office.description || `${office.address} - ${formatCurrency(office.monthlyPrice, language)}/${tr("tháng", "month")}.`}</p>
              </div>
            </article>
          ))}
          {!isLoading && showcaseOffices.length === 0 && (
            <article className="office-feature office-feature-large">
              <div>
                <span className="status status-inactive">EMPTY</span>
                <h3>{tr("Chưa có văn phòng khả dụng", "No offices currently available")}</h3>
                <p>{tr("Hiện chưa có văn phòng đang mở cho khách hàng. Vui lòng quay lại sau hoặc liên hệ đội tư vấn.", "There are no offices open for leasing at the moment. Please return later or contact our advisory team.")}</p>
              </div>
            </article>
          )}
        </div>
      </section>

      <section className="workflow-band">
        <div className="section-header">
          <p className="eyebrow">{tr("Quy trình", "Process")}</p>
          <h2>{tr("Từ nhu cầu đến hợp đồng trong một trải nghiệm liền mạch", "From requirements to contract in one seamless journey")}</h2>
        </div>
        <div className="process-list">
          <article>
            <span>1</span>
            <div>
              <h3>{tr("Khách chọn văn phòng", "Choose an office")}</h3>
              <p>{tr("Xem thông tin, diện tích, giá thuê và tình trạng còn trống.", "Review details, area, rent and current availability.")}</p>
            </div>
          </article>
          <article>
            <span>2</span>
            <div>
              <h3>{tr("Gửi yêu cầu thuê", "Submit a leasing request")}</h3>
              <p>{tr("Yêu cầu được chuyển đến đội quản lý để tiếp nhận và phản hồi.", "Your request is sent to the management team for review and response.")}</p>
            </div>
          </article>
          <article>
            <span>3</span>
            <div>
              <h3>{tr("Quản lý trên dashboard", "Manage from the dashboard")}</h3>
              <p>{tr("Đội vận hành theo dõi văn phòng, yêu cầu, khách hàng và hợp đồng trong một nơi.", "The operations team tracks offices, requests, customers and contracts in one place.")}</p>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
