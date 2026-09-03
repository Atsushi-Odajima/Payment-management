"use client";

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { DataTable, type DataColumn } from "@/components/data-table";
import { AdminStatusBadge, RoleBadge } from "@/components/admin-badges";
import { useFormatDateTime, useT } from "@/components/language-provider";
import type { AdminView } from "@/lib/admin/types";
import type { QueryParams, SortState } from "@/lib/query";

export function AdminsView({ admins, total, page, pageSize, sort, params }: { admins: AdminView[]; total: number; page: number; pageSize: number; sort: SortState; params: QueryParams }) {
  const t = useT();
  const formatDate = useFormatDateTime();

  const columns: DataColumn<AdminView>[] = [
    { key: "loginId", header: t("admins.thLoginId"), sortable: true, render: (a) => <span className="font-mono text-xs font-medium text-slate-900">{a.loginId}</span> },
    { key: "name", header: t("admins.thName"), sortable: true, render: (a) => <span className="font-medium text-slate-900">{a.name}</span> },
    { key: "email", header: t("admins.thEmail"), render: (a) => <span className="text-slate-700">{a.email}</span> },
    { key: "role", header: t("admins.thRole"), render: (a) => <RoleBadge role={a.role} /> },
    { key: "status", header: t("admins.thStatus"), render: (a) => <AdminStatusBadge status={a.status} /> },
    { key: "totp", header: t("admins.thTotp"), render: (a) => <span className={a.totpEnabled ? "text-emerald-700" : "text-slate-400"}>{a.totpEnabled ? t("common.enabled") : t("common.disabled")}</span> },
    { key: "lastLoginAt", header: t("admins.thLastLogin"), sortable: true, render: (a) => <span className="text-xs text-slate-500">{a.lastLoginAt ? formatDate(a.lastLoginAt) : t("adminDetail.never")}</span> },
    { key: "createdAt", header: t("admins.thCreatedAt"), sortable: true, render: (a) => <span className="text-xs text-slate-500">{formatDate(a.createdAt)}</span> },
  ];

  return (
    <div>
      <PageHeader
        title={t("admins.title")}
        description={t("admins.description")}
        helpHref="/manual/admins"
        actions={
          <Link href="/admins/new" className="btn-primary">
            {t("admins.add")}
          </Link>
        }
      />
      <DataTable
        columns={columns}
        rows={admins}
        rowKey={(a) => a.id}
        rowHref={(a) => `/admins/${a.id}`}
        basePath="/admins"
        params={params}
        sort={sort}
        total={total}
        page={page}
        pageSize={pageSize}
        csvHref="/api/admins?format=csv"
        emptyText={t("admins.empty")}
        minWidth="min-w-[960px]"
      />
    </div>
  );
}
