import { useMemo, useState } from "react";
import { OfficeDetail, OfficeList, useOffices, useOfficeSearch, type Office } from "../features/offices";
import { RentalRequestForm } from "../features/rental-requests";

export function OfficeSearchPage() {
  const initialQuery = new URLSearchParams(window.location.search).get("q") ?? "";
  const { input, setInput, query, submit } = useOfficeSearch(initialQuery);
  const { items, isLoading, error } = useOffices({ q: query });
  const [selectedOfficeId, setSelectedOfficeId] = useState("");

  const selectedOffice = useMemo(
    () => items.find((office) => office.id === selectedOfficeId) ?? items[0],
    [items, selectedOfficeId]
  );

  function handleSelect(office: Office) {
    setSelectedOfficeId(office.id);
  }

  return (
    <main className="app-shell customer-shell">
      <section className="toolbar">
        <div>
          <p className="eyebrow">Booking workspace</p>
          <h1>Tìm văn phòng phù hợp</h1>
          <p className="muted">Chọn không gian, xem giá nhanh và gửi yêu cầu thuê trong cùng một luồng.</p>
        </div>
        <form className="search" onSubmit={submit}>
          <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Tìm theo tên hoặc địa chỉ" />
          <button type="submit">Tìm kiếm</button>
        </form>
      </section>

      {error && <div className="notice">Chưa tải được danh sách văn phòng. Vui lòng thử lại sau.</div>}

      <section className="layout">
        <div aria-busy={isLoading}>
          {isLoading && <div className="skeleton-stack"><span /><span /><span /></div>}
          <OfficeList offices={items} selectedOfficeId={selectedOffice?.id} onSelect={handleSelect} />
        </div>
        <OfficeDetail office={selectedOffice} />
        <RentalRequestForm officeId={selectedOffice?.id} />
      </section>
    </main>
  );
}
