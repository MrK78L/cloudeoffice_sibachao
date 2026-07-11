import { formatCurrency, formatStatus } from "../../../shared/utils/format";
import type { Office } from "../types";

type OfficeDetailProps = {
  office?: Office;
};

export function OfficeDetail({ office }: OfficeDetailProps) {
  if (!office) {
    return (
      <article className="office-detail">
        <p>Chưa có dữ liệu văn phòng.</p>
      </article>
    );
  }

  const imageUrl =
    office.imageUrl ??
    "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1400&q=80";

  return (
    <article className="office-detail">
      <div className="office-hero-image" style={{ backgroundImage: `url(${imageUrl})` }}>
        <span className={`status status-${office.status.toLowerCase()}`}>{formatStatus(office.status)}</span>
      </div>
      <div className="office-detail-body">
        <p className="eyebrow">Chi tiết văn phòng</p>
        <h2>{office.title}</h2>
        <p className="muted">{office.address}</p>
      </div>
      <dl>
        <div>
          <dt>Diện tích</dt>
          <dd>{office.areaSqm} m²</dd>
        </div>
        <div>
          <dt>Giá thuê</dt>
          <dd>{formatCurrency(office.monthlyPrice)}/tháng</dd>
        </div>
        <div>
          <dt>Tình trạng</dt>
          <dd>{formatStatus(office.status)}</dd>
        </div>
        <div>
          <dt>Khả năng sử dụng</dt>
          <dd>{Math.max(4, Math.round(office.areaSqm / 5))} chỗ</dd>
        </div>
      </dl>
      <p className="office-description">{office.description}</p>
    </article>
  );
}
