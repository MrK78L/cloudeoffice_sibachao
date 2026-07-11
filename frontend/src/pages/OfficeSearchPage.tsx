import { useMemo, useState } from "react";
import { OfficeDetail, OfficeList, useOffices, useOfficeSearch, type Office } from "../features/offices";
import { RentalRequestForm } from "../features/rental-requests";

export function OfficeSearchPage() {
  const initialQuery = new URLSearchParams(window.location.search).get("q") ?? "";
  const statusParam = new URLSearchParams(window.location.search).get("status");
  const initialStatus = ["AVAILABLE", "RESERVED", "LEASED", "INACTIVE"].includes(statusParam ?? "")
    ? statusParam as Office["status"]
    : "ALL";
  const { input, setInput, query, status, setStatus, submit, clear } = useOfficeSearch(initialQuery, initialStatus);
  const { items, isLoading, error } = useOffices({ q: query, status: status === "ALL" ? undefined : status });
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
          <select aria-label="Lọc theo trạng thái" onChange={(event) => setStatus(event.target.value as Office["status"] | "ALL")} value={status}>
            <option value="ALL">Tất cả trạng thái</option>
            <option value="AVAILABLE">Đang trống</option>
            <option value="RESERVED">Đang giữ chỗ</option>
            <option value="LEASED">Đã thuê</option>
            <option value="INACTIVE">Tạm ngừng</option>
          </select>
          <button type="submit">Tìm kiếm</button>
        </form>
      </section>

      {error && <div className="notice">Chưa tải được danh sách văn phòng. Vui lòng thử lại sau.</div>}

      <section className="layout">
        <div aria-busy={isLoading}>
          {isLoading && <div className="skeleton-stack"><span /><span /><span /></div>}
          <OfficeList offices={items} selectedOfficeId={selectedOffice?.id} onSelect={handleSelect} />
          {!isLoading && !error && items.length === 0 && (
            <div className="empty-state search-empty-state">
              <strong>Chưa tìm thấy văn phòng phù hợp</strong>
              <p>Thử từ khóa khác hoặc mở rộng trạng thái tìm kiếm.</p>
              <button className="link-button" onClick={clear} type="button">Xóa bộ lọc</button>
            </div>
          )}
        </div>
        <OfficeDetail office={selectedOffice} />
        <RentalRequestForm officeId={selectedOffice?.id} />
      </section>
    </main>
  );
}
