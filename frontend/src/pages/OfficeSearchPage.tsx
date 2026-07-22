import { FormEvent, useEffect, useRef, useState } from "react";
import { OfficeList, useOffices, useOfficeSearch, type Office } from "../features/offices";
import { useLanguage } from "../features/i18n";

const officesPerPage = 6;

export function OfficeSearchPage() {
  const { tr } = useLanguage();
  const initialQuery = new URLSearchParams(window.location.search).get("q") ?? "";
  const statusParam = new URLSearchParams(window.location.search).get("status");
  const initialStatus = ["AVAILABLE", "RESERVED", "LEASED"].includes(statusParam ?? "")
    ? statusParam as Office["status"]
    : "ALL";
  const { input, setInput, query, status, setStatus, submit, clear } = useOfficeSearch(initialQuery, initialStatus);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageTokens, setPageTokens] = useState<Array<string | undefined>>([undefined]);
  const resultsRef = useRef<HTMLElement>(null);
  const { items, isLoading, nextToken, error } = useOffices({
    q: query,
    status: status === "ALL" ? undefined : status,
    nextToken: pageTokens[pageIndex],
    limit: officesPerPage
  });
  const hasActiveFilters = Boolean(query || status !== "ALL");

  useEffect(() => {
    setPageIndex(0);
    setPageTokens([undefined]);
  }, [query, status]);

  function scrollToResults() {
    window.requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start"
      });
    });
  }

  function handleSearch(event: FormEvent) {
    submit(event);
    setPageIndex(0);
    setPageTokens([undefined]);
  }

  function handleClearFilters() {
    clear();
    setPageIndex(0);
    setPageTokens([undefined]);
  }

  function goToPreviousPage() {
    if (pageIndex === 0 || isLoading) return;
    setPageIndex((current) => current - 1);
    scrollToResults();
  }

  function goToNextPage() {
    if (!nextToken || isLoading) return;
    setPageTokens((current) => {
      const next = current.slice(0, pageIndex + 1);
      next[pageIndex + 1] = nextToken;
      return next;
    });
    setPageIndex((current) => current + 1);
    scrollToResults();
  }

  return (
    <main className="app-shell customer-shell office-discovery">
      <header className="office-discovery-header">
        <div className="office-discovery-copy">
          <p className="eyebrow">{tr("Danh mục văn phòng", "Office portfolio")}</p>
          <h1>{tr("Chọn không gian phù hợp với đội ngũ", "Find a workspace for your team")}</h1>
          <p>{tr("So sánh vị trí, diện tích và chi phí trước khi xem chi tiết hoặc đặt lịch tham quan.", "Compare location, space and pricing before viewing details or scheduling a tour.")}</p>
        </div>
        <form className="office-search-panel" onSubmit={handleSearch}>
          <label className="office-search-field office-search-keyword">
            <span>{tr("Từ khóa", "Keyword")}</span>
            <input value={input} onChange={(event) => setInput(event.target.value)} placeholder={tr("Tên văn phòng, tòa nhà hoặc địa chỉ", "Office, building or address")} />
          </label>
          <label className="office-search-field">
            <span>{tr("Tình trạng", "Availability")}</span>
            <select onChange={(event) => setStatus(event.target.value as Office["status"] | "ALL")} value={status}>
              <option value="ALL">{tr("Tất cả văn phòng", "All offices")}</option>
              <option value="AVAILABLE">{tr("Đang trống", "Available")}</option>
              <option value="RESERVED">{tr("Đang giữ chỗ", "Reserved")}</option>
              <option value="LEASED">{tr("Đã thuê", "Leased")}</option>
            </select>
          </label>
          <button className="office-search-submit" type="submit">{tr("Tìm văn phòng", "Find offices")}</button>
          {hasActiveFilters && <button className="office-search-reset" onClick={handleClearFilters} type="button">{tr("Xóa lọc", "Clear")}</button>}
        </form>
      </header>

      {error && <div className="notice">{tr("Chưa tải được danh sách văn phòng. Vui lòng thử lại sau.", "Unable to load offices. Please try again later.")}</div>}

      <section className="office-results" aria-busy={isLoading} ref={resultsRef}>
        <div className="office-results-header">
          <div>
            <h2>{tr("Văn phòng đang hiển thị", "Available listings")}</h2>
            <p>{tr("Mở trang chi tiết để xem đầy đủ tiện ích và gửi yêu cầu.", "Open a listing for full amenities and enquiry options.")}</p>
          </div>
          {!isLoading && <strong aria-live="polite">{tr("Trang", "Page")} {pageIndex + 1} · {items.length} {tr("văn phòng", "offices")}</strong>}
        </div>

        {isLoading && (
          <div className="office-card-grid office-card-skeletons">
            {Array.from({ length: 6 }, (_, index) => <span key={index} />)}
          </div>
        )}

        {!isLoading && <OfficeList offices={items} />}

        {!isLoading && (
          <div className="office-results-footer">
          {(pageIndex > 0 || Boolean(nextToken)) && (
            <nav className="office-pagination" aria-label={tr("Phân trang văn phòng", "Office pagination")}>
              <button disabled={pageIndex === 0} onClick={goToPreviousPage} type="button">
                <span aria-hidden="true">←</span> {tr("Trang trước", "Previous")}
              </button>
              <span aria-current="page">{tr("Trang", "Page")} <strong>{pageIndex + 1}</strong></span>
              <button disabled={!nextToken} onClick={goToNextPage} type="button">
                {tr("Trang sau", "Next")} <span aria-hidden="true">→</span>
              </button>
            </nav>
          )}
          {!error && items.length === 0 && (
            <div className="empty-state search-empty-state">
              <strong>{tr("Chưa tìm thấy văn phòng phù hợp", "No matching offices found")}</strong>
              <p>{tr("Thử từ khóa khác hoặc mở rộng trạng thái tìm kiếm.", "Try another keyword or broaden the status filter.")}</p>
              <button className="link-button" onClick={handleClearFilters} type="button">{tr("Xóa bộ lọc", "Clear filters")}</button>
            </div>
          )}
          </div>
        )}
      </section>
    </main>
  );
}
