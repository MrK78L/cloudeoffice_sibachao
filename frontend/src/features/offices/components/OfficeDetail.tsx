import { formatCurrency, formatStatus } from "../../../shared/utils/format";
import type { Office } from "../types";
import { useLanguage } from "../../i18n";

type OfficeDetailProps = {
  office?: Office;
};

export function OfficeDetail({ office }: OfficeDetailProps) {
  const { language, tr } = useLanguage();
  if (!office) {
    return (
      <article className="office-detail">
        <p>{tr("Chưa có dữ liệu văn phòng.", "No office data available.")}</p>
      </article>
    );
  }

  const imageUrl =
    office.imageUrl ??
    "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1400&q=80";
  const capacity = Math.max(4, Math.round(office.areaSqm / 5));
  const locationParts = [
    office.buildingName,
    office.floor === undefined ? "" : `${tr("Tầng", "Floor")} ${office.floor}`,
    office.roomNumber ? `${tr("Phòng", "Room")} ${office.roomNumber}` : ""
  ].filter(Boolean);

  return (
    <article className="office-detail">
      <div className="office-hero-image">
        <img alt={office.title} src={imageUrl} />
        <span className={`status status-${office.status.toLowerCase()}`}>{formatStatus(office.status, language)}</span>
      </div>
      <div className="office-detail-body">
        <div className="office-detail-heading">
          <p className="eyebrow">{tr("Thông tin văn phòng", "Office overview")}</p>
          <h1>{office.title}</h1>
          <p className="office-detail-address">{office.address}</p>
          {locationParts.length > 0 && <p className="office-detail-location">{locationParts.join(" · ")}</p>}
        </div>

        <dl>
          <div>
            <dt>{tr("Diện tích", "Area")}</dt>
            <dd>{office.areaSqm} m²</dd>
          </div>
          <div>
            <dt>{tr("Sức chứa gợi ý", "Suggested capacity")}</dt>
            <dd>{capacity} {tr("chỗ", "seats")}</dd>
          </div>
          <div>
            <dt>{tr("Giá thuê mỗi tháng", "Monthly rent")}</dt>
            <dd>{formatCurrency(office.monthlyPrice, language)}</dd>
          </div>
          <div>
            <dt>{tr("Tình trạng", "Status")}</dt>
            <dd>{formatStatus(office.status, language)}</dd>
          </div>
        </dl>

        <section className="office-detail-section">
          <h2>{tr("Mô tả không gian", "About this workspace")}</h2>
          <p className="office-description">{office.description || tr("Thông tin chi tiết đang được cập nhật.", "Detailed information is being updated.")}</p>
        </section>

        {Boolean(office.amenities?.length) && (
          <section className="office-detail-section">
            <h2>{tr("Tiện ích đi kèm", "Included amenities")}</h2>
            <ul className="office-amenities">
              {office.amenities?.map((amenity) => <li key={amenity}>{amenity}</li>)}
            </ul>
          </section>
        )}
      </div>
    </article>
  );
}
