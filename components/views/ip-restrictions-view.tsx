"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { ProviderStatusBadge } from "@/components/payment-status-badge";
import { useApiJson, useFormatDateTime, useT } from "@/components/language-provider";
import { useConfirm } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast";
import type { IpMode, IpRestrictionView } from "@/lib/ip-restrictions/types";
import type { AllowVerdict } from "@/lib/ip";
import { cn } from "@/lib/utils";

export function IpRestrictionsView({
  rules,
  clientIp,
  verdict,
  target,
  mode,
  enabled,
  page,
  pageSize,
  total,
}: {
  rules: IpRestrictionView[];
  clientIp: string | null;
  verdict: AllowVerdict | null;
  target: string;
  mode: string;
  enabled: string;
  page: number;
  pageSize: number;
  total: number;
}) {
  const t = useT();
  const router = useRouter();
  const apiJson = useApiJson();
  const { confirm } = useConfirm();
  const toast = useToast();
  const formatDate = useFormatDateTime();
  const [busyId, setBusyId] = useState<string | null>(null);
  const params = { target: target || undefined, mode: mode || undefined, enabled: enabled || undefined };
  const href = (next: Partial<typeof params>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, ...next })) if (v) q.set(k, v);
    const qs = q.toString();
    return qs ? `/ip-restrictions?${qs}` : "/ip-restrictions";
  };

  async function remove(rule: IpRestrictionView) {
    const ok = await confirm({
      title: t("ipRestrictions.delete"),
      body: t("ipRestrictions.confirmDelete", { cidr: rule.cidr, label: rule.label }),
      confirmLabel: t("ipRestrictions.delete"),
      tone: "danger",
    });
    if (!ok) return;
    setBusyId(rule.id);
    const res = await apiJson(`/api/ip-restrictions/${rule.id}`, { method: "DELETE" });
    setBusyId(null);
    if (!res.ok) {
      toast.show(res.error.message, "error");
      return;
    }
    toast.show(t("ipRestrictions.deleted"));
    router.refresh();
  }

  return (
    <div>
      <PageHeader
        title={t("ipRestrictions.title")}
        description={t("ipRestrictions.description")}
        helpHref="/manual/ip-restrictions"
        actions={
          <Link href="/ip-restrictions/new" className="btn-primary">
            {t("ipRestrictions.add")}
          </Link>
        }
      />

      <section className="card mb-6 flex flex-wrap items-center justify-between gap-4 p-5" aria-live="polite">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("ipRestrictions.currentIp")}</p>
          <p className="mt-1 font-mono text-lg text-slate-900">{clientIp ?? t("ipRestrictions.ipUnknown")}</p>
          <p className="mt-1 text-xs text-slate-500">{t("ipRestrictions.currentIpHelp")}</p>
        </div>
        <VerdictBadge verdict={verdict} />
      </section>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div role="group" aria-label={t("ipRestrictions.thTarget")} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
          <Chip href={href({ target: undefined })} active={!target} label={t("common.modeAll")} />
          <Chip href={href({ target: "admin" })} active={target === "admin"} label={t("ipEnums.target.admin")} />
          <Chip href={href({ target: "merchant_api" })} active={target === "merchant_api"} label={t("ipEnums.target.merchant_api")} />
        </div>
        <div role="group" aria-label={t("ipRestrictions.thMode")} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
          <Chip href={href({ mode: undefined })} active={!mode} label={t("common.modeAll")} />
          <Chip href={href({ mode: "deny" })} active={mode === "deny"} label={t("ipEnums.mode.deny")} />
          <Chip href={href({ mode: "allow" })} active={mode === "allow"} label={t("ipEnums.mode.allow")} />
        </div>
        <div role="group" aria-label={t("ipRestrictions.thEnabled")} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
          <Chip href={href({ enabled: undefined })} active={!enabled} label={t("common.modeAll")} />
          <Chip href={href({ enabled: "1" })} active={enabled === "1"} label={t("common.enabled")} />
          <Chip href={href({ enabled: "0" })} active={enabled === "0"} label={t("common.disabled")} />
        </div>
      </div>

      <div className="card overflow-hidden">
        {total === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500">
            {t("ipRestrictions.empty")}
            <div className="mt-4">
              <Link href="/ip-restrictions/new" className="btn-primary">
                {t("ipRestrictions.add")}
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-5 py-3">{t("ipRestrictions.thMode")}</th>
                    <th scope="col" className="px-5 py-3">{t("ipRestrictions.thTarget")}</th>
                    <th scope="col" className="px-5 py-3">{t("ipRestrictions.thCidr")}</th>
                    <th scope="col" className="px-5 py-3">{t("ipRestrictions.thLabel")}</th>
                    <th scope="col" className="px-5 py-3">{t("ipRestrictions.thMerchant")}</th>
                    <th scope="col" className="px-5 py-3">{t("ipRestrictions.thEnabled")}</th>
                    <th scope="col" className="px-5 py-3">{t("ipRestrictions.thCreatedAt")}</th>
                    <th scope="col" className="px-5 py-3 text-right">{t("ipRestrictions.thActions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rules.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/60">
                      <td className="px-5 py-3"><ModeBadge mode={r.mode} /></td>
                      <td className="px-5 py-3 text-slate-700">{t(`ipEnums.target.${r.target}`)}</td>
                      <td className="px-5 py-3 font-mono text-xs text-slate-900">{r.cidr}</td>
                      <td className="px-5 py-3 text-slate-700">{r.label}</td>
                      <td className="px-5 py-3 text-slate-700">
                        {r.merchant ? (
                          <Link href={`/merchants/${r.merchant.id}`} className="text-brand-700 hover:underline">
                            {r.merchant.merchantCode}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-5 py-3"><ProviderStatusBadge active={r.enabled} /></td>
                      <td className="px-5 py-3 text-xs text-slate-500">{formatDate(r.createdAt)}</td>
                      <td className="px-5 py-3 text-right">
                        <span className="inline-flex items-center gap-3">
                          <Link href={`/ip-restrictions/${r.id}`} className="text-xs font-medium text-brand-700 hover:underline">
                            {t("ipRestrictions.edit")}
                          </Link>
                          <button type="button" className="text-xs font-medium text-rose-700 hover:underline disabled:opacity-50" disabled={busyId === r.id} onClick={() => remove(r)}>
                            {t("ipRestrictions.delete")}
                          </button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination basePath="/ip-restrictions" params={params} page={page} pageSize={pageSize} total={total} />
          </>
        )}
      </div>
    </div>
  );
}

export function ModeBadge({ mode }: { mode: IpMode }) {
  const t = useT();
  return (
    <span className={cn("badge", mode === "deny" ? "bg-rose-100 text-rose-800 ring-rose-200" : "bg-emerald-100 text-emerald-800 ring-emerald-200")}>
      {t(`ipEnums.mode.${mode}`)}
    </span>
  );
}

function VerdictBadge({ verdict }: { verdict: AllowVerdict | null }) {
  const t = useT();
  if (!verdict) return <span className="badge bg-slate-100 text-slate-700 ring-slate-200">{t("ipRestrictions.verdict_unknown")}</span>;
  switch (verdict.kind) {
    case "blocked":
      return (
        <span className="text-right">
          <span className="badge bg-rose-100 text-rose-800 ring-rose-200">{t("ipRestrictions.verdict_blocked")}</span>
          <span className="mt-1 block font-mono text-xs text-slate-500">{t("ipRestrictions.matchedRule", { rule: verdict.matched })}</span>
        </span>
      );
    case "allowed":
      return (
        <span className="text-right">
          <span className="badge bg-emerald-100 text-emerald-800 ring-emerald-200">{t("ipRestrictions.verdict_allowed")}</span>
          <span className="mt-1 block font-mono text-xs text-slate-500">{t("ipRestrictions.matchedRule", { rule: verdict.matched })}</span>
        </span>
      );
    case "denied":
      return <span className="badge bg-amber-100 text-amber-800 ring-amber-200">{t("ipRestrictions.verdict_denied")}</span>;
    case "no_rules":
      return <span className="badge bg-slate-100 text-slate-700 ring-slate-200">{t("ipRestrictions.verdict_noRules")}</span>;
    default:
      return <span className="badge bg-slate-100 text-slate-700 ring-slate-200">{t("ipRestrictions.verdict_unsupported")}</span>;
  }
}

function Chip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link href={href} aria-current={active ? "true" : undefined} className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition", active ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100")}>
      {label}
    </Link>
  );
}
