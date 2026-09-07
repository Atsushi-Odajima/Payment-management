"use client";

// Shared list table: sortable headers (query-string driven, so the server
// does the sorting), clickable rows, pagination and a CSV export link.
// Filters stay screen-specific; pass the current query params so sort and
// page links keep them.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pagination } from "./pagination";
import { useT } from "./language-provider";
import { useMode } from "./mode-provider";
import { Icon } from "./icons";
import { buildHref, type QueryParams, type SortState } from "@/lib/query";
import { cn } from "@/lib/utils";

export interface DataColumn<T> {
  key: string;
  header: React.ReactNode;
  sortable?: boolean;
  align?: "left" | "right";
  className?: string;
  render: (row: T) => React.ReactNode;
}

export interface DataTableProps<T> {
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string;
  rowClassName?: (row: T) => string | undefined;
  basePath: string;
  params: QueryParams;
  sort?: SortState;
  total: number;
  page: number;
  pageSize: number;
  /** Absolute or relative URL that returns text/csv for the current filter. */
  csvHref?: string;
  emptyText: string;
  minWidth?: string;
}

export function DataTable<T>(props: DataTableProps<T>) {
  const { columns, rows, rowKey, rowHref, rowClassName, basePath, params, sort, total, page, pageSize, csvHref, emptyText } = props;
  const t = useT();
  const router = useRouter();
  const { mode } = useMode();

  const sortHref = (key: string) => {
    const dir = sort?.key === key && sort.dir === "asc" ? "desc" : "asc";
    return buildHref(basePath, params, { sort: key, dir, page: undefined });
  };

  return (
    <div className="card overflow-hidden">
      {total === 0 ? (
        <p className="px-6 py-12 text-center text-sm text-slate-500">{emptyText}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className={cn("w-full text-left text-sm", props.minWidth ?? "min-w-[820px]")}>
            <caption className="px-5 py-1 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-400" style={{ captionSide: "top" }} data-testid="table-mode">
              {mode === "live" ? t("mode.currentLive") : t("mode.currentTest")}
            </caption>
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {columns.map((c) => (
                  <th key={c.key} scope="col" className={cn("px-5 py-3", c.align === "right" && "text-right", c.className)} aria-sort={sort?.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
                    {c.sortable ? (
                      <Link href={sortHref(c.key)} className="inline-flex items-center gap-1 hover:text-slate-800">
                        {c.header}
                        <span aria-hidden className={cn("text-[10px]", sort?.key === c.key ? "text-brand-700" : "text-slate-300")}>
                          {sort?.key === c.key && sort.dir === "desc" ? "▼" : "▲"}
                        </span>
                      </Link>
                    ) : (
                      c.header
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => {
                const href = rowHref?.(row);
                return (
                  <tr
                    key={rowKey(row)}
                    className={cn("hover:bg-slate-50/60", href && "cursor-pointer", rowClassName?.(row))}
                    onClick={href ? () => router.push(href) : undefined}
                  >
                    {columns.map((c) => (
                      <td key={c.key} className={cn("px-5 py-3", c.align === "right" && "text-right", c.className)}>
                        {c.render(row)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100">
        <div className="flex-1">
          <Pagination basePath={basePath} params={params} page={page} pageSize={pageSize} total={total} />
        </div>
        {csvHref && total > 0 && (
          <a href={csvHref} download className="mr-5 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
            <Icon name="clipboard" className="h-3.5 w-3.5" />
            {t("dataTable.csv")}
          </a>
        )}
      </div>
    </div>
  );
}
