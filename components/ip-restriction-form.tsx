"use client";

import { useId, useState } from "react";
import { useApiJson, useT } from "./language-provider";
import { FormField } from "./ui/form-field";
import { SegmentedControl } from "./ui/segmented-control";
import { validateIpRestrictionInput, type IpErrorCode, type IpFieldKey } from "@/lib/ip-restrictions/schema";
import type { IpRestrictionInput, IpRestrictionView, IpTarget } from "@/lib/ip-restrictions/types";
import { isValidCidr, normalizeCidr } from "@/lib/ip";
import { cn } from "@/lib/utils";

type FieldErrors = Partial<Record<IpFieldKey, IpErrorCode>>;

export interface MerchantOption {
  id: string;
  merchantCode: string;
  siteName: string;
}

export function IpRestrictionForm({
  mode,
  ruleId,
  initial,
  merchants,
  onSaved,
  onCancel,
}: {
  mode: "create" | "edit";
  ruleId?: string;
  initial: IpRestrictionInput;
  merchants: MerchantOption[];
  onSaved: (rule: IpRestrictionView) => void;
  onCancel?: () => void;
}) {
  const t = useT();
  const apiJson = useApiJson();
  const formId = useId();
  const [values, setValues] = useState<IpRestrictionInput>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const id = (k: string) => `${formId}-${k}`;

  function set<K extends IpFieldKey>(key: K, value: IpRestrictionInput[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  const cidrLive = values.cidr.trim() ? (isValidCidr(values.cidr) ? normalizeCidr(values.cidr) : null) : undefined;
  const missingRequired =
    !values.cidr.trim() || !values.label.trim() || (values.target === "merchant_api" && !values.merchantId);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const v = validateIpRestrictionInput(values);
    if (!v.ok) {
      setErrors(v.errors);
      const first = (Object.keys(v.errors) as IpFieldKey[])[0];
      document.getElementById(id(first))?.focus();
      return;
    }
    setSubmitting(true);
    const res = await apiJson<Omit<IpRestrictionView, "createdAt" | "updatedAt"> & { createdAt: string; updatedAt: string }>(
      mode === "create" ? "/api/ip-restrictions" : `/api/ip-restrictions/${ruleId}`,
      { method: mode === "create" ? "POST" : "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(v.data) },
    );
    setSubmitting(false);
    if (!res.ok) {
      const details = res.error.details as { fieldErrors?: FieldErrors } | undefined;
      if (details?.fieldErrors) setErrors(details.fieldErrors);
      setFormError(res.error.message);
      return;
    }
    onSaved({ ...res.data, createdAt: new Date(res.data.createdAt), updatedAt: new Date(res.data.updatedAt) });
  }

  const err = (k: IpFieldKey) => (errors[k] ? t(`ipForm.errors.${errors[k]}`) : null);

  return (
    <form onSubmit={onSubmit} className="card space-y-6 p-6" aria-busy={submitting} noValidate>
      <SegmentedControl<IpTarget>
        label={t("ipForm.target")}
        value={values.target}
        onChange={(v) => {
          set("target", v);
          if (v === "admin") set("merchantId", null);
        }}
        options={[
          { value: "admin", label: t("ipEnums.target.admin") },
          { value: "merchant_api", label: t("ipEnums.target.merchant_api") },
        ]}
      />
      <p className="-mt-4 text-xs text-slate-500">{t("ipForm.targetHelp")}</p>

      {values.target === "merchant_api" && (
        <FormField id={id("merchantId")} label={t("ipForm.merchant")} required error={err("merchantId")}>
          <select
            id={id("merchantId")}
            className={cn("input", errors.merchantId && "border-rose-400")}
            value={values.merchantId ?? ""}
            onChange={(e) => set("merchantId", e.target.value || null)}
            aria-invalid={!!errors.merchantId}
          >
            <option value="">{t("common.select")}</option>
            {merchants.map((m) => (
              <option key={m.id} value={m.id}>
                {m.merchantCode} — {m.siteName}
              </option>
            ))}
          </select>
        </FormField>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id={id("cidr")}
          label={t("ipForm.cidr")}
          required
          error={err("cidr")}
          help={
            cidrLive === undefined
              ? t("ipForm.cidrHelp")
              : cidrLive === null
                ? t("ipForm.errors.cidr")
                : t("ipForm.cidrNormalized", { cidr: cidrLive })
          }
        >
          <input
            id={id("cidr")}
            className={cn("input font-mono", (errors.cidr || cidrLive === null) && "border-rose-400")}
            value={values.cidr}
            onChange={(e) => set("cidr", e.target.value)}
            placeholder="203.0.113.0/24"
            inputMode="decimal"
            maxLength={43}
            aria-invalid={!!errors.cidr || cidrLive === null}
          />
        </FormField>
        <FormField id={id("label")} label={t("ipForm.label")} required error={err("label")}>
          <input id={id("label")} className={cn("input", errors.label && "border-rose-400")} value={values.label} onChange={(e) => set("label", e.target.value)} maxLength={80} placeholder={t("ipForm.labelPlaceholder")} />
        </FormField>
      </div>

      <SegmentedControl<"on" | "off">
        label={t("ipForm.enabled")}
        value={values.enabled ? "on" : "off"}
        onChange={(v) => set("enabled", v === "on")}
        options={[
          { value: "on", label: t("common.enabled"), activeClass: "bg-emerald-50 text-emerald-900 ring-emerald-400" },
          { value: "off", label: t("common.disabled"), activeClass: "bg-slate-100 text-slate-800 ring-slate-400" },
        ]}
      />

      {formError && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {formError}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-5">
        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={submitting}>
            {t("common.cancel")}
          </button>
        )}
        <button type="submit" className="btn-primary" disabled={submitting || missingRequired || cidrLive === null}>
          {submitting ? t("common.processing") : mode === "create" ? t("ipForm.submitCreate") : t("ipForm.submitUpdate")}
        </button>
      </div>
    </form>
  );
}
