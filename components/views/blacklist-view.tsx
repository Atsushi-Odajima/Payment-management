"use client";

// Blacklist (Phase F-2): candidates from repeated-failure detection (approve /
// reject), manual entries, enable / disable, and the global thresholds.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { DataTable, type DataColumn } from "@/components/data-table";
import { BlacklistStatusBadge } from "@/components/risk-badges";
import { FormField } from "@/components/ui/form-field";
import { useApiJson, useFormatDateTime, useT } from "@/components/language-provider";
import { useRole } from "@/components/session-provider";
import { useToast } from "@/components/toast";
import type { BlacklistFilters, BlacklistRow } from "@/lib/risk/blacklist";
import { BLACKLIST_KINDS, BLACKLIST_SOURCES, BLACKLIST_STATUSES, type BlacklistKind, type BlacklistStatus, type RiskSettingsInput } from "@/lib/risk/types";
import { buildHref, type QueryParams, type SortState } from "@/lib/query";
import type { MessageKey } from "@/lib/i18n";

export function BlacklistView({
  rows,
  total,
  page,
  pageSize,
  sort,
  filters,
  candidateCount,
  settings,
}: {
  rows: BlacklistRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: SortState;
  filters: BlacklistFilters;
  candidateCount: number;
  settings: RiskSettingsInput;
}) {
  const t = useT();
  const router = useRouter();
  const apiJson = useApiJson();
  const toast = useToast();
  const { isMaster } = useRole();
  const formatDate = useFormatDateTime();
  const [busyId, setBusyId] = useState<string | null>(null);
  const params: QueryParams = {
    kind: filters.kind || undefined,
    source: filters.source || undefined,
    status: filters.status || undefined,
    sort: sort.key === "createdAt" && sort.dir === "desc" ? undefined : sort.key,
    dir: sort.key === "createdAt" && sort.dir === "desc" ? undefined : sort.dir,
  };
  const go = (next: QueryParams) => router.push(buildHref("/blacklist", params, { ...next, page: undefined }));
  const hasFilter = Boolean(filters.kind || filters.source || filters.status);
  const csvQuery = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) csvQuery.set(k, v);
  csvQuery.set("format", "csv");

  async function setStatus(row: BlacklistRow, status: BlacklistStatus) {
    setBusyId(row.id);
    const res = await apiJson(`/api/blacklist/${row.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
    setBusyId(null);
    if (!res.ok) {
      toast.show(res.error.message, "error");
      return;
    }
    toast.show(t(`blacklist.done.${status}` as MessageKey));
    router.refresh();
  }

  const columns: DataColumn<BlacklistRow>[] = [
    { key: "status", header: t("blacklist.thStatus"), sortable: true, render: (r) => <BlacklistStatusBadge status={r.status} /> },
    { key: "kind", header: t("blacklist.thKind"), sortable: true, render: (r) => t(`blacklistEnums.kind.${r.kind}` as MessageKey) },
    { key: "value", header: t("blacklist.thValue"), render: (r) => <span className="break-all font-mono text-xs">{r.kind === "card" ? `${r.value.slice(0, 12)}…` : r.value}</span> },
    { key: "source", header: t("blacklist.thSource"), sortable: true, render: (r) => t(`blacklistEnums.source.${r.source}` as MessageKey) },
    { key: "reason", header: t("blacklist.thReason"), render: (r) => <span className="text-xs text-slate-600">{r.reason ?? "—"}</span> },
    { key: "createdAt", header: t("blacklist.thAt"), sortable: true, render: (r) => <span className="whitespace-nowrap text-xs text-slate-600">{formatDate(r.createdAt)}</span> },
    {
      key: "actions",
      header: t("blacklist.thActions"),
      render: (r) => (
        <span className="flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
          {r.status === "candidate" && (
            <>
              <button type="button" className="btn-primary px-2 py-1 text-xs" disabled={!isMaster || busyId === r.id} onClick={() => setStatus(r, "active")}>
                {t("blacklist.approve")}
              </button>
              <button type="button" className="btn-secondary px-2 py-1 text-xs" disabled={!isMaster || busyId === r.id} onClick={() => setStatus(r, "rejected")}>
                {t("blacklist.reject")}
              </button>
            </>
          )}
          {r.status === "active" && (
            <button type="button" className="btn-secondary px-2 py-1 text-xs" disabled={!isMaster || busyId === r.id} onClick={() => setStatus(r, "disabled")}>
              {t("blacklist.disable")}
            </button>
          )}
          {(r.status === "disabled" || r.status === "rejected") && (
            <button type="button" className="btn-secondary px-2 py-1 text-xs" disabled={!isMaster || busyId === r.id} onClick={() => setStatus(r, "active")}>
              {t("blacklist.enable")}
            </button>
          )}
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={t("blacklist.title")}
        description={t("blacklist.description")}
        helpHref="/manual/risk"
        actions={candidateCount > 0 ? <span className="badge bg-amber-100 text-amber-800 ring-amber-200">{t("blacklist.candidateCount", { count: candidateCount })}</span> : undefined}
      />

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <AddForm disabled={!isMaster} />
        <SettingsForm settings={settings} disabled={!isMaster} />
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3 text-xs text-slate-600">
        <label className="flex flex-col gap-1">
          <span>{t("blacklist.filterKind")}</span>
          <select className="input w-auto py-1.5 text-xs" value={filters.kind} onChange={(e) => go({ kind: e.target.value || undefined })}>
            <option value="">{t("common.modeAll")}</option>
            {BLACKLIST_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`blacklistEnums.kind.${k}` as MessageKey)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span>{t("blacklist.filterSource")}</span>
          <select className="input w-auto py-1.5 text-xs" value={filters.source} onChange={(e) => go({ source: e.target.value || undefined })}>
            <option value="">{t("common.modeAll")}</option>
            {BLACKLIST_SOURCES.map((s) => (
              <option key={s} value={s}>
                {t(`blacklistEnums.source.${s}` as MessageKey)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span>{t("blacklist.filterStatus")}</span>
          <select className="input w-auto py-1.5 text-xs" value={filters.status} onChange={(e) => go({ status: e.target.value || undefined })}>
            <option value="">{t("common.modeAll")}</option>
            {BLACKLIST_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`blacklistEnums.status.${s}` as MessageKey)}
              </option>
            ))}
          </select>
        </label>
        {hasFilter && (
          <Link href="/blacklist" className="pb-2 text-xs font-medium text-brand-700 hover:underline">
            {t("blacklist.filterClear")}
          </Link>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        rowClassName={(r) => (r.status === "candidate" ? "bg-amber-50/40" : undefined)}
        basePath="/blacklist"
        params={params}
        sort={sort}
        total={total}
        page={page}
        pageSize={pageSize}
        csvHref={`/api/blacklist?${csvQuery.toString()}`}
        emptyText={t("blacklist.empty")}
      />
    </div>
  );
}

function AddForm({ disabled }: { disabled: boolean }) {
  const t = useT();
  const router = useRouter();
  const apiJson = useApiJson();
  const toast = useToast();
  const [kind, setKind] = useState<BlacklistKind>("ip");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await apiJson("/api/blacklist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, value, reason }) });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    toast.show(t("blacklist.added"));
    setValue("");
    setReason("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-5" aria-busy={busy}>
      <h2 className="text-sm font-semibold text-slate-800">{t("blacklist.addTitle")}</h2>
      <p className="text-xs text-slate-500">{t("blacklist.addHelp")}</p>
      <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
        <FormField id="bl-kind" label={t("blacklist.thKind")}>
          <select id="bl-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as BlacklistKind)}>
            {BLACKLIST_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`blacklistEnums.kind.${k}` as MessageKey)}
              </option>
            ))}
          </select>
        </FormField>
        <FormField id="bl-value" label={t("blacklist.thValue")} required help={t(`blacklist.valueHelp.${kind}` as MessageKey)}>
          <input id="bl-value" className="input font-mono" value={value} onChange={(e) => setValue(e.target.value)} maxLength={200} required />
        </FormField>
      </div>
      <FormField id="bl-reason" label={t("blacklist.thReason")}>
        <input id="bl-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
      </FormField>
      {error && (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <button type="submit" className="btn-primary" disabled={busy || disabled}>
          {busy ? t("common.processing") : t("blacklist.add")}
        </button>
      </div>
    </form>
  );
}

function SettingsForm({ settings, disabled }: { settings: RiskSettingsInput; disabled: boolean }) {
  const t = useT();
  const router = useRouter();
  const apiJson = useApiJson();
  const toast = useToast();
  const [windowMinutes, setWindowMinutes] = useState(String(settings.windowMinutes));
  const [maxFailures, setMaxFailures] = useState(String(settings.maxFailures));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await apiJson("/api/risk-settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ windowMinutes: Number(windowMinutes), maxFailures: Number(maxFailures) }) });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    toast.show(t("blacklist.settingsSaved"));
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-5" aria-busy={busy}>
      <h2 className="text-sm font-semibold text-slate-800">{t("blacklist.settingsTitle")}</h2>
      <p className="text-xs text-slate-500">{t("blacklist.settingsHelp")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="rs-window" label={t("blacklist.windowMinutes")}>
          <input id="rs-window" type="number" min={1} max={1440} className="input" value={windowMinutes} onChange={(e) => setWindowMinutes(e.target.value)} required />
        </FormField>
        <FormField id="rs-max" label={t("blacklist.maxFailures")}>
          <input id="rs-max" type="number" min={2} max={100} className="input" value={maxFailures} onChange={(e) => setMaxFailures(e.target.value)} required />
        </FormField>
      </div>
      {error && (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <button type="submit" className="btn-secondary" disabled={busy || disabled}>
          {busy ? t("common.processing") : t("blacklist.saveSettings")}
        </button>
      </div>
    </form>
  );
}
