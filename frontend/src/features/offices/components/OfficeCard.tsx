import { navigate } from "../../../app/router";
import { formatCurrency } from "../../../shared/utils/format";
import type { Office } from "../types";

type OfficeCardProps = {
  office: Office;
  active?: boolean;
  onSelect?: (office: Office) => void;
};

export function OfficeCard({ office, active = false, onSelect }: OfficeCardProps) {
  const imageUrl =
    office.imageUrl ??
    "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=900&q=80";

  return (
    <button
      className={active ? "office-row active" : "office-row"}
      data-price={`${formatCurrency(office.monthlyPrice)}/tháng`}
      onClick={() => (onSelect ? onSelect(office) : navigate(`/offices/${office.id}`))}
      type="button"
    >
      <span className="office-thumb" style={{ backgroundImage: `url(${imageUrl})` }} aria-hidden="true" />
      <span className="office-row-content">
        <span className="office-row-top">
          <span>{office.title}</span>
          <span className={`status status-${office.status.toLowerCase()}`}>{office.status}</span>
        </span>
        <strong>{formatCurrency(office.monthlyPrice)}/tháng</strong>
        <small>{office.address}</small>
      </span>
    </button>
  );
}
