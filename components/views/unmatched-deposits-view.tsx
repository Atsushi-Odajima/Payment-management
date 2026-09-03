"use client";

// Unmatched bank deposits (未消込入金): money that arrived without a usable
// transfer id. Support attaches the right transfer id ("match"), which runs the
// normal deposit reconciliation and re-notifies the merchant's API, or
// dismisses the deposit. A small form registers deposits read off the bank
// statement (the bank notification API also files them automatically).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { PageHeader } from "@/components/page-header";
import { DataTable, type DataColumn } from "@/components/data-table";
import { FormField } from "@/components/ui/form-field";
import { PaymentStatusBadge } from "@/components/payment-status-badge";
import { useApiJson, useFormatDateTime, useT } from "@/components/language-provider";
import { useConfirm } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";
import { useRole } from "@/components/session-provider";
import { UNMATCHED_DEPOSIT_STATUSES, type TransferCandidate, type UnmatchedDepositFilters, type UnmatchedDepositRow, type UnmatchedDepositStatus } from "@/lib/deposits/types";
import { isPaymentStatus } from "@/lib/payments/transitions";
import { buildHref, type QueryParams, type SortState } from "@/lib/query";
import type { MessageKey } from "@/lib/i18n";
import { cn, formatYen } from "@/lib/utils";

const STATUS_STYLE: Record<UnmatchedDepositStatus, string> = {
  unmatched: "bg-amber-100 text-amber-800 ring-amber-200",
  matched: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  dismissed: "bg-slate-100 text-slate-700 ring-slate-200",
};

export function UnmatchedDepositStatusBadge({ status }: { status: UnmatchedDepositStatus }) {
  const t = useT();
  return <span className={cn("badge", STATUS_STYLE[status])}>{t(`unmatchedDepositEnums.status.${status}` as MessageKey)}</span>;
}

export function UnmatchedDepositsView({ rows, total, page, pageSize, sort, filters, openCount }: { rows: UnmatchedDepositRow[]; total: number; page: number; pageSize: number; sort: SortState; filters: UnmatchedDepositFilters; openCount: number }) {
  const t = useT();
  const router = useRouter();
  const apiJson = useApiJson();
  const toast = useToast();
  const { confirm } = useConfirm();
  const { isMaster } = useRole();
  const formatDate = useFormatDateTime();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const matchRef = useRef<{ transferId: string }>({ transferId: "" });
  const dismissRef = useRef<{ reason: string }>({ reason: "" });
  const params: QueryParams = {
    status: filters.status || undefined,
    sort: sort.key === "receivedAt" && sort.dir === "desc" ? undefined : sort.key,
    dir: sort.key === "receivedAt" && sort.dir === "desc" ? undefined : sort.dir,
  };
  const go = (next: QueryParams) => router.push(buildHref("/unmatched-deposits", params, { ...next, page: undefined }));
  const csvQuery = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) csvQuery.set(k, v);
  csvQuery.set("mode", filters.mode);
  csvQuery.set("format", "csv");

  async function match(row: UnmatchedDepositRow) {
    matchRef.current = { transferId: row.givenTransferId && /^\d{7,8}$/.test(row.givenTransferId) ? row.givenTransferId : "" };
    const ok = await confirm({
      title: t("unmatchedDeposits.actions.match"),
      body: t("unmatchedDeposits.confirm.match", { amount: formatYen(row.amount), payer: row.payerName }),
      confirmLabel: t("unmatchedDeposits.actions.match"),
      fields: <MatchFields depositId={row.id} valueRef={matchRef} />,
    });
    if (!ok) return;
    setBusyId(row.id);
    const res = await apiJson<{ payment: { status: string; depositDiff: "short" | "excess" | null }; renotified: boolean }>(`/api/unmatched-deposits/${row.id}/match`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ transferId: matchRef.current.transferId }) });
    setBusyId(null);
    if (!res.ok) {
      toast.show(res.error.message, "error");
      return;
    }
    const key = res.data.payment.status === "captured" ? (res.data.renotified ? "unmatchedDeposits.done.matchedNotified" : "unmatchedDeposits.done.matched") : "unmatchedDeposits.done.matchedShort";
    toast.show(t(key as MessageKey));
    router.refresh();
  }

  async function dismiss(row: UnmatchedDepositRow) {
    dismissRef.current = { reason: "" };
    const ok = await confirm({
      title: t("unmatchedDeposits.actions.dismiss"),
      body: t("unmatchedDeposits.confirm.dismiss", { amount: formatYen(row.amount), payer: row.payerName }),
      confirmLabel: t("unmatchedDeposits.actions.dismiss"),
      tone: "danger",
      fields: <DismissFields valueRef={dismissRef} />,
    });
    if (!ok) return;
    setBusyId(row.id);
    const res = await apiJson(`/api/unmatched-deposits/${row.id}/dismiss`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason: dismissRef.current.reason }) });
    setBusyId(null);
    if (!res.ok) {
      toast.show(res.error.message, "error");
      return;
    }
    toast.show(t("unmatchedDeposits.done.dismissed"));
    router.refresh();
  }

  const columns: DataColumn<UnmatchedDepositRow>[] = [
    { key: "status", header: t("unmatchedDeposits.thStatus"), sortable: true, render: (r) => <UnmatchedDepositStatusBadge status={r.status} /> },
    { key: "receivedAt", header: t("unmatchedDeposits.thReceived"), sortable: true, render: (r) => <span className="whitespace-nowrap text-xs text-slate-600">{formatDate(r.receivedAt)}</span> },
    { key: "payerName", header: t("unmatchedDeposits.thPayer"), sortable: true, render: (r) => <span className="font-medium text-slate-900">{r.payerName}</span> },
    { key: "amount", header: t("unmatchedDeposits.thAmount"), sortable: true, align: "right", render: (r) => <span className="tabular-nums">{formatYen(r.amount)}</span> },
    { key: "given", header: t("unmatchedDeposits.thGiven"), render: (r) => <span className="font-mono text-xs">{r.givenTransferId || "—"}</span> },
    { key: "reference", header: t("unmatchedDeposits.thReference"), render: (r) => <span className="text-xs text-slate-600">{r.bankReference || "—"}{r.note ? ` · ${r.note}` : ""}</span> },
    { key: "source", header: t("unmatchedDeposits.thSource"), render: (r) => <span className="text-xs text-slate-600">{t(`unmatchedDepositEnums.source.${r.source}` as MessageKey)}</span> },
    {
      key: "result",
      header: t("unmatchedDeposits.thResult"),
      render: (r) =>
        r.payment ? (
          <span className="flex flex-wrap items-center gap-1 text-xs">
            <Link href={`/payments/${r.payment.id}`} className="font-medium text-brand-700 hover:underline">
              {r.payment.orderNumber}
            </Link>
            <span className="font-mono text-slate-500">{r.matchedTransferId}</span>
            {isPaymentStatus(r.payment.status) && <PaymentStatusBadge status={r.payment.status} />}
          </span>
        ) : r.status === "dismissed" ? (
          <span className="text-xs text-slate-500">{r.dismissReason}</span>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        ),
    },
    {
      key: "actions",
      header: t("unmatchedDeposits.thActions"),
      render: (r) =>
        r.status === "unmatched" ? (
          <span className="flex gap-1">
            <button type="button" className="btn-primary px-2 py-1 text-xs" disabled={busyId !== null || !isMaster} title={isMaster ? undefined : t("unmatchedDeposits.masterOnly")} onClick={(e) => { e.stopPropagation(); void match(r); }}>
              {t("unmatchedDeposits.actions.match")}
            </button>
            <button type="button" className="btn-secondary px-2 py-1 text-xs" disabled={busyId !== null} onClick={(e) => { e.stopPropagation(); void dismiss(r); }}>
              {t("unmatchedDeposits.actions.dismiss")}
            </button>
          </span>
        ) : (
          <span className="text-xs text-slate-400">{r.matchedAt ? formatDate(r.matchedAt) : "—"}</span>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={t("unmatchedDeposits.title")}
        description={t("unmatchedDeposits.description")}
        helpHref="/manual/applications"
        actions={
          <>
            {openCount > 0 && <span className="badge bg-amber-100 text-amber-800 ring-amber-200">{t("unmatchedDeposits.openCount", { count: openCount })}</span>}
            <button type="button" className="btn-primary" onClick={() => setShowForm((v) => !v)} aria-expanded={showForm}>
              {t("unmatchedDeposits.register")}
            </button>
          </>
        }
      />
      {showForm && <RegisterForm mode={filters.mode} onDone={() => { setShowForm(false); router.refresh(); }} />}
      <div className="mb-4 flex flex-wrap items-end gap-3 text-xs text-slate-600">
        <label className="flex flex-col gap-1">
          <span>{t("unmatchedDeposits.thStatus")}</span>
          <select className="input w-auto py-1.5 text-xs" value={filters.status} onChange={(e) => go({ status: e.target.value || undefined })}>
            <option value="">{t("common.modeAll")}</option>
            {UNMATCHED_DEPOSIT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`unmatchedDepositEnums.status.${s}` as MessageKey)}
              </option>
            ))}
          </select>
        </label>
        {filters.status && (
          <Link href="/unmatched-deposits" className="pb-2 text-xs font-medium text-brand-700 hover:underline">
            {t("unmatchedDeposits.filterClear")}
          </Link>
        )}
      </div>
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} basePath="/unmatched-deposits" params={params} sort={sort} total={total} page={page} pageSize={pageSize} csvHref={`/api/unmatched-deposits?${csvQuery.toString()}`} emptyText={t("unmatchedDeposits.empty")} minWidth="min-w-[1080px]" />
      <p className="mt-4 text-xs text-slate-500">{t("unmatchedDeposits.note")}</p>
    </div>
  );
}

/** Transfer id input with the awaiting transfers that could be the target (exact amounts first). */
function MatchFields({ depositId, valueRef }: { depositId: string; valueRef: MutableRefObject<{ transferId: string }> }) {
  const t = useT();
  const apiJson = useApiJson();
  const formatDate = useFormatDateTime();
  const { update } = useConfirm();
  const [transferId, setTransferId] = useState(valueRef.current.transferId);
  const [candidates, setCandidates] = useState<TransferCandidate[] | null>(null);
  const valid = /^\d{7,8}$/.test(transferId);

  useEffect(() => {
    let alive = true;
    void apiJson<{ candidates: TransferCandidate[] }>(`/api/unmatched-deposits/${depositId}`).then((res) => {
      if (alive) setCandidates(res.ok ? res.data.candidates : []);
    });
    return () => {
      alive = false;
    };
  }, [apiJson, depositId]);

  useEffect(() => {
    valueRef.current = { transferId };
    update({ confirmDisabled: !valid });
  }, [transferId, valid, update, valueRef]);

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="match-transfer-id" className="label">
          {t("unmatchedDeposits.transferId")}
        </label>
        <input id="match-transfer-id" className="input font-mono" inputMode="numeric" value={transferId} onChange={(e) => setTransferId(e.target.value.trim())} aria-invalid={!valid} maxLength={8} autoFocus />
        <p className="help">{t("unmatchedDeposits.transferIdHelp")}</p>
      </div>
      <div>
        <p className="text-xs font-semibold text-slate-600">{t("unmatchedDeposits.candidates")}</p>
        {candidates === null ? (
          <p className="text-xs text-slate-400">{t("common.processing")}</p>
        ) : candidates.length === 0 ? (
          <p className="text-xs text-slate-400">{t("unmatchedDeposits.noCandidates")}</p>
        ) : (
          <ul className="mt-1 max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {candidates.map((c) => (
              <li key={c.paymentId}>
                <button type="button" className={cn("flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-brand-50", transferId === c.transferId && "bg-brand-50")} onClick={() => setTransferId(c.transferId)}>
                  <span>
                    <span className="font-mono font-semibold text-slate-900">{c.transferId}</span>
                    <span className="ml-2 text-slate-600">{c.orderNumber} · {c.merchant?.merchantCode ?? "—"} · {c.customerName ?? "—"}</span>
                    {c.transferDueAt && <span className={cn("ml-2", c.overdue ? "text-rose-700" : "text-slate-400")}>{formatDate(c.transferDueAt)}</span>}
                  </span>
                  <span className={cn("tabular-nums", c.exact ? "font-semibold text-emerald-700" : "text-slate-600")}>{formatYen(c.amount)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function DismissFields({ valueRef }: { valueRef: MutableRefObject<{ reason: string }> }) {
  const t = useT();
  const { update } = useConfirm();
  const [reason, setReason] = useState("");
  useEffect(() => {
    valueRef.current = { reason };
    update({ confirmDisabled: reason.trim().length === 0 });
  }, [reason, update, valueRef]);
  return (
    <div>
      <label htmlFor="dismiss-reason" className="label">
        {t("unmatchedDeposits.dismissReason")}
      </label>
      <input id="dismiss-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} autoFocus />
    </div>
  );
}

function RegisterForm({ mode, onDone }: { mode: string; onDone: () => void }) {
  const t = useT();
  const apiJson = useApiJson();
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [payerName, setPayerName] = useState("");
  const [receivedAt, setReceivedAt] = useState("");
  const [bankReference, setBankReference] = useState("");
  const [givenTransferId, setGivenTransferId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await apiJson(`/api/unmatched-deposits?mode=${mode}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: Number(amount), payerName, receivedAt: receivedAt ? new Date(receivedAt).toISOString() : "", bankReference, givenTransferId, note }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    toast.show(t("unmatchedDeposits.registered"));
    onDone();
  }

  return (
    <form onSubmit={submit} className="card mb-6 space-y-4 p-5" aria-busy={busy} aria-label={t("unmatchedDeposits.register")}>
      <p className="text-sm text-slate-600">{t("unmatchedDeposits.registerHelp")}</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField id="ud-amount" label={t("unmatchedDeposits.thAmount")} required>
          <input id="ud-amount" type="number" min={1} className="input" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </FormField>
        <FormField id="ud-payer" label={t("unmatchedDeposits.thPayer")} required>
          <input id="ud-payer" className="input" value={payerName} onChange={(e) => setPayerName(e.target.value)} maxLength={120} required />
        </FormField>
        <FormField id="ud-received" label={t("unmatchedDeposits.thReceived")} help={t("unmatchedDeposits.receivedHelp")}>
          <input id="ud-received" type="datetime-local" className="input" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />
        </FormField>
        <FormField id="ud-given" label={t("unmatchedDeposits.thGiven")} help={t("unmatchedDeposits.givenHelp")}>
          <input id="ud-given" className="input font-mono" value={givenTransferId} onChange={(e) => setGivenTransferId(e.target.value)} maxLength={20} />
        </FormField>
        <FormField id="ud-reference" label={t("unmatchedDeposits.thReference")}>
          <input id="ud-reference" className="input" value={bankReference} onChange={(e) => setBankReference(e.target.value)} maxLength={80} />
        </FormField>
        <FormField id="ud-note" label={t("unmatchedDeposits.noteLabel")}>
          <input id="ud-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </FormField>
      </div>
      {error && (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onDone}>
          {t("common.cancel")}
        </button>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? t("common.processing") : t("unmatchedDeposits.registerSubmit")}
        </button>
      </div>
    </form>
  );
}
