import type { Office } from "../types";
import { OfficeCard } from "./OfficeCard";

type OfficeListProps = {
  offices: Office[];
};

export function OfficeList({ offices }: OfficeListProps) {
  return (
    <div className="office-card-grid">
      {offices.map((office) => (
        <OfficeCard key={office.id} office={office} />
      ))}
    </div>
  );
}
