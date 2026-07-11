import { FormEvent, useState } from "react";
import { navigate } from "../app/router";
import { useAuth } from "../features/auth";
import { useOffices, type Office } from "../features/offices";
import { formatCurrency, formatStatus } from "../shared/utils/format";

export function HomePage() {
  const { isAuthenticated } = useAuth();
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
          alt="Không gian văn phòng mở hiện đại"
          className="hero-image"
          fetchPriority="high"
          src="https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1800&q=82"
        />
        <div className="hero-overlay" aria-hidden="true" />
        <div className="hero-content">
          <p className="eyebrow">Workspace booking platform</p>
          <h1>Không gian văn phòng cao cấp, sẵn sàng cho đội ngũ của bạn</h1>
          <p>
            Tìm văn phòng phù hợp, gửi yêu cầu thuê và theo dõi hợp đồng trên một nền tảng an toàn, luôn cập nhật.
          </p>
          <div className="hero-metrics" aria-label="Chỉ số tin cậy">
            <span>{isLoading ? "..." : `${offices.length}+`} văn phòng khả dụng</span>
            <span>Dữ liệu luôn được cập nhật</span>
          </div>
          <div className="hero-actions">
            <button onClick={() => navigate("/offices")} type="button">
              Khám phá văn phòng
            </button>
            <button className="secondary" onClick={() => navigate(isAuthenticated ? "/my-contracts" : "/login")} type="button">
              Hợp đồng của tôi
            </button>
          </div>
        </div>
        <form className="floating-search" onSubmit={handleSearch}>
          <label>
            Từ khóa
            <input
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="Quận 1, Thủ Đức, Etown..."
              value={keyword}
            />
          </label>
          <label>
            Trạng thái
            <select onChange={(event) => setStatus(event.target.value as Office["status"])} value={status}>
              <option value="AVAILABLE">Đang trống</option>
              <option value="RESERVED">Đang giữ chỗ</option>
              <option value="LEASED">Đã thuê</option>
            </select>
          </label>
          <button type="submit">Tìm ngay</button>
        </form>
      </section>

      <section className="trust-strip" aria-label="Chỉ số vận hành">
        <article>
          <strong>{isLoading ? "..." : offices.length}</strong>
          <span>văn phòng sẵn sàng</span>
        </article>
        <article>
          <strong>An toàn</strong>
          <span>bảo vệ tài khoản khách hàng</span>
        </article>
        <article>
          <strong>Ổn định</strong>
          <span>sẵn sàng mở rộng khi nhu cầu tăng</span>
        </article>
      </section>

      <section className="enterprise-band" id="solutions">
        <div className="section-header">
          <p className="eyebrow">Giải pháp cho doanh nghiệp</p>
          <h2>Một nền tảng cho toàn bộ vòng đời thuê văn phòng</h2>
          <p>
            Từ tìm kiếm mặt bằng, gửi yêu cầu thuê đến quản lý hồ sơ và hợp đồng, mọi dữ liệu được đồng bộ trong một trải nghiệm liền mạch.
          </p>
        </div>
        <div className="solution-grid">
          <article>
            <span>01</span>
            <h3>Tìm kiếm chính xác</h3>
            <p>Danh sách văn phòng được cập nhật từ hệ thống quản lý, giúp khách hàng xem đúng tình trạng hiện tại.</p>
          </article>
          <article>
            <span>02</span>
            <h3>Quy trình thuê rõ ràng</h3>
            <p>Khách đăng nhập, gửi yêu cầu thuê và theo dõi hồ sơ cá nhân.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Vận hành trên cloud</h3>
            <p>Đội vận hành quản lý văn phòng, yêu cầu thuê, khách hàng và hợp đồng trong dashboard.</p>
          </article>
        </div>
      </section>

      <section className="showcase-band">
        <div className="section-header">
          <p className="eyebrow">Danh mục nổi bật</p>
          <h2>Không gian làm việc được cập nhật trực tiếp từ hệ thống</h2>
        </div>
        <div className="office-showcase">
          {showcaseOffices.map((office, index) => (
            <article className={index === 0 ? "office-feature office-feature-large" : "office-feature"} key={office.id}>
              <img
                alt={office.title}
                src={office.imageUrl ?? "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1200&q=82"}
              />
              <div>
                <span className={`status status-${office.status.toLowerCase()}`}>{formatStatus(office.status)}</span>
                <h3>{office.title}</h3>
                <p>{office.description || `${office.address} - ${formatCurrency(office.monthlyPrice)}/tháng.`}</p>
              </div>
            </article>
          ))}
          {!isLoading && showcaseOffices.length === 0 && (
            <article className="office-feature office-feature-large">
              <div>
                <span className="status status-inactive">EMPTY</span>
                <h3>Chưa có văn phòng khả dụng</h3>
                <p>Hiện chưa có văn phòng đang mở cho khách hàng. Vui lòng quay lại sau hoặc liên hệ đội tư vấn.</p>
              </div>
            </article>
          )}
        </div>
      </section>

      <section className="workflow-band">
        <div className="section-header">
          <p className="eyebrow">Quy trình</p>
          <h2>Từ nhu cầu đến hợp đồng trong một trải nghiệm liền mạch</h2>
        </div>
        <div className="process-list">
          <article>
            <span>1</span>
            <div>
              <h3>Khách chọn văn phòng</h3>
              <p>Xem thông tin, diện tích, giá thuê và tình trạng còn trống.</p>
            </div>
          </article>
          <article>
            <span>2</span>
            <div>
              <h3>Gửi yêu cầu thuê</h3>
              <p>Yêu cầu được chuyển đến đội quản lý để tiếp nhận và phản hồi.</p>
            </div>
          </article>
          <article>
            <span>3</span>
            <div>
              <h3>Quản lý trên dashboard</h3>
              <p>Đội vận hành theo dõi văn phòng, yêu cầu, khách hàng và hợp đồng trong một nơi.</p>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
