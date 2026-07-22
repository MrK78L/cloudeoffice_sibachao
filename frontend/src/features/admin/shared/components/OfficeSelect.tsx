import type { Office } from "../../../offices/types";
import { useLanguage } from "../../../i18n";

type OfficeSelectProps = {
  offices: Office[];
  value: string;
  onChange: (officeId: string) => void;
  disabled?: boolean;
  isLoading?: boolean;
  required?: boolean;
  allowedStatuses?: Office["status"][];
  highlightedOfficeIds?: ReadonlySet<string>;
};

export function formatOfficeLabel(office: Office, language: "vi" | "en") {
  const location = [
    office.buildingName,
    office.floor !== undefined ? `${language === "vi" ? "Tầng" : "Floor"} ${office.floor}` : "",
    office.roomNumber ? `${language === "vi" ? "Phòng" : "Room"} ${office.roomNumber}` : ""
  ].filter(Boolean).join(" · ");

  return `${office.title}${location ? ` · ${location}` : ""}`;
}

export function OfficeSelect({
  offices,
  value,
  onChange,
  disabled = false,
  isLoading = false,
  required = false,
  allowedStatuses,
  highlightedOfficeIds
}: OfficeSelectProps) {
  const { language, tr } = useLanguage();
  const sortedOffices = [...offices].sort((left, right) => (
    formatOfficeLabel(left, language).localeCompare(formatOfficeLabel(right, language), language)
  ));

  return (
    <select
      disabled={disabled || isLoading}
      onChange={(event) => onChange(event.target.value)}
      required={required}
      value={value}
    >
      <option value="">
        {isLoading ? tr("Đang tải văn phòng...", "Loading offices...") : tr("Chọn văn phòng", "Select an office")}
      </option>
      {sortedOffices.map((office) => (
        <option disabled={Boolean(allowedStatuses && !allowedStatuses.includes(office.status) && office.id !== value)} key={office.id} value={office.id}>
          {highlightedOfficeIds?.has(office.id) ? `${tr("Đã duyệt yêu cầu", "Approved request")} · ` : ""}{formatOfficeLabel(office, language)}
        </option>
      ))}
    </select>
  );
}
