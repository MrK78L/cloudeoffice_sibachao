import { ReactNode } from "react";

export type DataTableColumn<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
};

type DataTableProps<T> = {
  data: T[];
  columns: DataTableColumn<T>[];
  isLoading?: boolean;
};

export function DataTable<T>({ data, columns, isLoading = false }: DataTableProps<T>) {
  return (
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
            data.map((row, index) => (
              <tr key={index}>
                {columns.map((column) => (
                  <td key={column.key}>{column.render(row)}</td>
                ))}
              </tr>
            ))}
          {!isLoading && data.length === 0 && (
            <tr>
              <td colSpan={columns.length}>Không có dữ liệu.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
