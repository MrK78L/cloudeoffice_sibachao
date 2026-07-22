import { navigate } from "../../../app/router";
import { formatCurrency, formatStatus } from "../../../shared/utils/format";
import type { Office } from "../types";
import { useLanguage } from "../../i18n";

type OfficeCardProps = {
  office: Office;
};

export function OfficeCard({ office }: OfficeCardProps) {
  const { language, tr } = useLanguage();
  const imageUrl =
    office.imageUrl ??
    "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=900&q=80";
  const capacity = Math.max(4, Math.round(office.areaSqm / 5));
  const location = office.buildingName
    ? `${office.buildingName}${office.floor === undefined ? "" : ` · ${tr("Tầng", "Floor")} ${office.floor}`}`
    : tr("Vị trí linh hoạt", "Flexible location");

  return (
    <article className="office-card">
      <button onClick={() => navigate(`/offices/${office.id}`)} type="button">
        <span className="office-card-media">
          <img alt="" src={imageUrl} />
          <span className={`status status-${office.status.toLowerCase()}`}>{formatStatus(office.status, language)}</span>
        </span>
        <span className="office-card-body">
          <small className="office-card-location">{location}</small>
          <strong className="office-card-title">{office.title}</strong>
          <span className="office-card-address">{office.address}</span>
          <span className="office-card-facts">
            <span><small>{tr("Diện tích", "Area")}</small><strong>{office.areaSqm} m²</strong></span>
            <span><small>{tr("Sức chứa", "Capacity")}</small><strong>{capacity} {tr("chỗ", "seats")}</strong></span>
          </span>
          <span className="office-card-footer">
            <span className="office-card-price"><strong>{formatCurrency(office.monthlyPrice, language)}</strong><small>/{tr("tháng", "month")}</small></span>
            <span className="office-card-action">{tr("Xem chi tiết", "View details")} <span aria-hidden="true">→</span></span>
          </span>
        </span>
      </button>
    </article>
  );
}
