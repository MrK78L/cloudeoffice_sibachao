import { ReactNode, useEffect, useMemo, useState } from "react";
import { useLanguage } from "../../../i18n";

export type DataTableColumn<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
};

type DataTableProps<T> = {
  data: T[];
  columns: DataTableColumn<T>[];
  isLoading?: boolean;
  pageSize?: number;
  getRowKey?: (row: T) => string;
  emptyTitle?: string;
  emptyDescription?: string;
};

export function DataTable<T>({
  data,
  columns,
  isLoading = false,
  pageSize = 10,
  getRowKey,
  emptyTitle,
  emptyDescription
}: DataTableProps<T>) {
  const { tr } = useLanguage();
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(data.length / pageSize));
  const visibleRows = useMemo(() => data.slice((page - 1) * pageSize, page * pageSize), [data, page, pageSize]);

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);

  return (
    <div className="data-table-shell">
      <div className="table-wrap">
        <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading && (
            <tr>
              <td colSpan={columns.length}>
                <div className="skeleton-stack">
                  <span />
                  <span />
                  <span />
                </div>
              </td>
            </tr>
          )}
          {!isLoading &&
            visibleRows.map((row, index) => (
              <tr key={getRowKey ? getRowKey(row) : (page - 1) * pageSize + index}>
                {columns.map((column) => (
                  <td key={column.key}>{column.render(row)}</td>
                ))}
              </tr>
            ))}
          {!isLoading && data.length === 0 && (
            <tr>
              <td colSpan={columns.length}>
                <div className="admin-empty-state">
                  <strong>{emptyTitle ?? tr("Chưa có dữ liệu", "No data available")}</strong>
                  <span>{emptyDescription ?? tr("Hãy thay đổi bộ lọc hoặc tạo bản ghi mới.", "Adjust the filters or create a new record.")}</span>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
      {!isLoading && data.length > 0 && (
        <footer className="table-pagination">
          <span>{tr("Hiển thị", "Showing")} {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, data.length)} / {data.length}</span>
          <div>
            <button disabled={page === 1} onClick={() => setPage((current) => current - 1)} type="button">{tr("Trước", "Previous")}</button>
            <strong>{page} / {pageCount}</strong>
            <button disabled={page === pageCount} onClick={() => setPage((current) => current + 1)} type="button">{tr("Sau", "Next")}</button>
          </div>
        </footer>
      )}
    </div>
  );
}
