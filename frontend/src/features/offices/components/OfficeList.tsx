import type { Office } from "../types";
import { OfficeCard } from "./OfficeCard";

type OfficeListProps = {
  offices: Office[];
  selectedOfficeId?: string;
  onSelect?: (office: Office) => void;
};

export function OfficeList({ offices, selectedOfficeId, onSelect }: OfficeListProps) {
  return (
    <div className="office-list">
      {offices.map((office) => (
        <OfficeCard
          active={office.id === selectedOfficeId}
          key={office.id}
          office={office}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
