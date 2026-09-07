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
import { useCan } from "@/components/session-provider";
import { DISMISS_KINDS, UNMATCHED_DEPOSIT_STATUSES, type DismissKind, type TransferCandidate, type UnmatchedDepositFilters, type UnmatchedDepositReason, type UnmatchedDepositRow, type UnmatchedDepositStatus } from "@/lib/deposits/types";
import { formatCvsReceiptNo } from "@/lib/payments/konbini";
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

const REASON_STYLE: Record<UnmatchedDepositReason, string> = {
  late_deposit: "bg-orange-100 text-orange-800 ring-orange-200",
  cancelled_deposit: "bg-slate-200 text-slate-700 ring-slate-300",
  mode_mismatch: "bg-rose-100 text-rose-800 ring-rose-200",
};

/** Why a notification with a valid id still landed here (late / cancelled / other mode). */
export function UnmatchedDepositReasonBadge({ reason }: { reason: UnmatchedDepositReason }) {
  const t = useT();
  return <span className={cn("badge", REASON_STYLE[reason])}>{t(`unmatchedDepositEnums.reason.${reason}` as MessageKey)}</span>;
}

export function UnmatchedDepositsView({ rows, total, page, pageSize, sort, filters, openCount, highlight }: { rows: UnmatchedDepositRow[]; total: number; page: number; pageSize: number; sort: SortState; filters: UnmatchedDepositFilters; openCount: number; highlight?: string | null }) {
  const t = useT();
  const router = useRouter();
  const apiJson = useApiJson();
  const toast = useToast();
  const { confirm } = useConfirm();
  const isMaster = useCan("unmatched_deposit", "match");
  const formatDate = useFormatDateTime();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const matchRef = useRef<{ transferId: string }>({ transferId: "" });
  const dismissRef = useRef<{ reason: string; kind: DismissKind }>({ reason: "", kind: "other" });
  const lateRef = useRef<{ reason: string }>({ reason: "" });
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

  /** Apply a deposit that arrived after the linked transaction expired (late_deposit transition, Phase P1-3). */
  async function lateMatch(row: UnmatchedDepositRow) {
    lateRef.current = { reason: "" };
    const target = row.candidatePayment;
    const ok = await confirm({
      title: t("unmatchedDeposits.actions.lateMatch"),
      body: t("unmatchedDeposits.confirm.lateMatch", { amount: formatYen(row.amount), payer: row.payerName, order: target?.orderNumber ?? "—" }),
      confirmLabel: t("unmatchedDeposits.actions.lateMatch"),
      fields: <LateMatchFields valueRef={lateRef} />,
    });
    if (!ok) return;
    setBusyId(row.id);
    const res = await apiJson<{ payment: { status: string; depositDiff: "short" | "excess" | null }; renotified: boolean }>(`/api/unmatched-deposits/${row.id}/late-match`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason: lateRef.current.reason }) });
    setBusyId(null);
    if (!res.ok) {
      toast.show(res.error.message, "error");
      return;
    }
    toast.show(t(res.data.payment.depositDiff ? "unmatchedDeposits.done.lateMatchedDiff" : res.data.renotified ? "unmatchedDeposits.done.matchedNotified" : "unmatchedDeposits.done.matched"));
    router.refresh();
  }

  async function dismiss(row: UnmatchedDepositRow) {
    dismissRef.current = { reason: "", kind: row.reason === "late_deposit" || row.reason === "cancelled_deposit" ? "returned" : "other" };
    const ok = await confirm({
      title: t("unmatchedDeposits.actions.dismiss"),
      body: t("unmatchedDeposits.confirm.dismiss", { amount: formatYen(row.amount), payer: row.payerName }),
      confirmLabel: t("unmatchedDeposits.actions.dismiss"),
      tone: "danger",
      fields: <DismissFields valueRef={dismissRef} />,
    });
    if (!ok) return;
    setBusyId(row.id);
    const res = await apiJson(`/api/unmatched-deposits/${row.id}/dismiss`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason: dismissRef.current.reason, kind: dismissRef.current.kind }) });
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
    { key: "given", header: t("unmatchedDeposits.thGiven"), render: (r) => <span className="font-mono text-xs">{r.source === "cvs" && r.givenTransferId ? formatCvsReceiptNo(r.givenTransferId) : r.givenTransferId || "—"}</span> },
    {
      key: "reason",
      header: t("unmatchedDeposits.thReason"),
      render: (r) =>
        r.reason ? (
          <span className="flex flex-wrap items-center gap-1 text-xs">
            <UnmatchedDepositReasonBadge reason={r.reason} />
            {r.candidatePayment && (
              <Link href={`/payments/${r.candidatePayment.id}`} className="font-medium text-brand-700 hover:underline" onClick={(e) => e.stopPropagation()}>
                {r.candidatePayment.orderNumber}
              </Link>
            )}
            {r.candidatePayment && r.reason === "mode_mismatch" && <span className="text-slate-500">{t(r.candidatePayment.livemode ? "unmatchedDeposits.candidateLive" : "unmatchedDeposits.candidateTest")}</span>}
          </span>
        ) : (
          <span className="text-xs text-slate-400">{t("unmatchedDeposits.reasonNoId")}</span>
        ),
    },
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
          <span className="text-xs text-slate-500">
            {r.dismissKind && <span className="mr-1 font-medium text-slate-700">{t(`unmatchedDepositEnums.dismissKind.${r.dismissKind}` as MessageKey)}</span>}
            {r.dismissReason}
          </span>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        ),
    },
    {
      key: "actions",
      header: t("unmatchedDeposits.thActions"),
      render: (r) =>
        r.status === "unmatched" ? (
          <span className="flex flex-wrap gap-1">
            {r.reason === "late_deposit" && r.candidatePayment?.status === "expired" && (
              <button type="button" className="btn-primary px-2 py-1 text-xs" disabled={busyId !== null || !isMaster} title={isMaster ? undefined : t("unmatchedDeposits.masterOnly")} onClick={(e) => { e.stopPropagation(); void lateMatch(r); }}>
                {t("unmatchedDeposits.actions.lateMatch")}
              </button>
            )}
            {r.source !== "cvs" && (
              <button type="button" className={cn("px-2 py-1 text-xs", r.reason === "late_deposit" ? "btn-secondary" : "btn-primary")} disabled={busyId !== null || !isMaster} title={isMaster ? undefined : t("unmatchedDeposits.masterOnly")} onClick={(e) => { e.stopPropagation(); void match(r); }}>
                {t("unmatchedDeposits.actions.match")}
              </button>
            )}
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
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} rowClassName={(r) => (r.id === highlight ? "bg-brand-50" : r.reason === "late_deposit" && r.status === "unmatched" ? "bg-orange-50/40" : undefined)} basePath="/unmatched-deposits" params={params} sort={sort} total={total} page={page} pageSize={pageSize} csvHref={`/api/unmatched-deposits?${csvQuery.toString()}`} emptyText={t("unmatchedDeposits.empty")} minWidth="min-w-[1280px]" />
      <p className="mt-4 text-xs text-slate-500">{t("unmatchedDeposits.note")}</p>
      <p className="mt-1 text-xs text-slate-500">{t("unmatchedDeposits.lateNote")}</p>
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
            {candidates.map((c) => {
              const blocked = c.modeMismatch || c.late || c.status !== "awaiting_transfer";
              return (
                <li key={c.paymentId}>
                  <button
                    type="button"
                    className={cn("flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs", blocked ? "cursor-not-allowed opacity-60" : "hover:bg-brand-50", transferId === c.transferId && !blocked && "bg-brand-50")}
                    disabled={blocked}
                    aria-disabled={blocked}
                    onClick={() => !blocked && setTransferId(c.transferId)}
                  >
                    <span>
                      <span className="font-mono font-semibold text-slate-900">{c.transferId}</span>
                      <span className="ml-2 text-slate-600">{c.orderNumber} · {c.merchant?.merchantCode ?? "—"} · {c.customerName ?? "—"}</span>
                      {c.transferDueAt && <span className={cn("ml-2", c.overdue ? "text-rose-700" : "text-slate-400")}>{formatDate(c.transferDueAt)}</span>}
                      {c.modeMismatch && <span className="ml-2 font-medium text-rose-700">{t(c.livemode ? "unmatchedDeposits.candidateBlockedLive" : "unmatchedDeposits.candidateBlockedTest")}</span>}
                      {!c.modeMismatch && c.late && <span className="ml-2 font-medium text-orange-700">{t("unmatchedDeposits.candidateBlockedLate")}</span>}
                      {!c.modeMismatch && !c.late && c.status !== "awaiting_transfer" && <span className="ml-2 font-medium text-slate-500">{t("unmatchedDeposits.candidateBlockedStatus", { status: t(`status.${c.status}` as MessageKey) })}</span>}
                    </span>
                    <span className={cn("tabular-nums", c.exact ? "font-semibold text-emerald-700" : "text-slate-600")}>{formatYen(c.amount)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function DismissFields({ valueRef }: { valueRef: MutableRefObject<{ reason: string; kind: DismissKind }> }) {
  const t = useT();
  const { update } = useConfirm();
  const [reason, setReason] = useState("");
  const [kind, setKind] = useState<DismissKind>(valueRef.current.kind);
  useEffect(() => {
    valueRef.current = { reason, kind };
    update({ confirmDisabled: reason.trim().length === 0 });
  }, [reason, kind, update, valueRef]);
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="dismiss-kind" className="label">
          {t("unmatchedDeposits.dismissKind")}
        </label>
        <select id="dismiss-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as DismissKind)}>
          {DISMISS_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`unmatchedDepositEnums.dismissKind.${k}` as MessageKey)}
            </option>
          ))}
        </select>
        <p className="help">{t("unmatchedDeposits.dismissKindHelp")}</p>
      </div>
      <div>
        <label htmlFor="dismiss-reason" className="label">
          {t("unmatchedDeposits.dismissReason")}
        </label>
        <input id="dismiss-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} autoFocus />
      </div>
    </div>
  );
}

function LateMatchFields({ valueRef }: { valueRef: MutableRefObject<{ reason: string }> }) {
  const t = useT();
  const { update } = useConfirm();
  const [reason, setReason] = useState("");
  useEffect(() => {
    valueRef.current = { reason };
    update({ confirmDisabled: reason.trim().length === 0 });
  }, [reason, update, valueRef]);
  return (
    <div>
      <label htmlFor="late-reason" className="label">
        {t("unmatchedDeposits.lateReason")}
      </label>
      <input id="late-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} autoFocus />
      <p className="help">{t("unmatchedDeposits.lateReasonHelp")}</p>
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
