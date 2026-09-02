"use client";

import { useId, useState } from "react";
import { useApiJson, useT } from "./language-provider";
import { FormField } from "./ui/form-field";
import { SegmentedControl } from "./ui/segmented-control";
import { KANA_PLACEHOLDER } from "@/lib/merchants/schema";
import {
  REQUIRED_AGENT_FIELDS,
  validateAgentInput,
  type AgentErrorCode,
  type AgentFieldKey,
} from "@/lib/agents/schema";
import type { AgentInput, AgentStatus, AgentView } from "@/lib/agents/types";
import { cn } from "@/lib/utils";

type FieldErrors = Partial<Record<AgentFieldKey, AgentErrorCode>>;

export interface AgentFormProps {
  mode: "create" | "edit";
  agentCode: string;
  initial: AgentInput;
  agentId?: string;
  onSaved: (agent: AgentView) => void;
  onCancel?: () => void;
}

function withDates(a: Omit<AgentView, "createdAt" | "updatedAt"> & { createdAt: string | Date; updatedAt: string | Date }): AgentView {
  return { ...a, createdAt: new Date(a.createdAt), updatedAt: new Date(a.updatedAt) };
}

export function AgentForm({ mode, agentCode, initial, agentId, onSaved, onCancel }: AgentFormProps) {
  const t = useT();
  const apiJson = useApiJson();
  const formId = useId();
  const [values, setValues] = useState<AgentInput>(initial);
  const [feeRateText, setFeeRateText] = useState(String(initial.feeRate));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const missingRequired = REQUIRED_AGENT_FIELDS.some((k) => String(values[k]).trim() === "");
  const id = (k: string) => `${formId}-${k}`;

  function set<K extends AgentFieldKey>(key: K, value: AgentInput[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function focusFirstError(errs: FieldErrors) {
    const first = (Object.keys(errs) as AgentFieldKey[]).find((k) => errs[k]);
    if (!first) return;
    const el = document.getElementById(id(first));
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus({ preventScroll: true });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const candidate: AgentInput = { ...values, feeRate: feeRateText.trim() === "" ? NaN : Number(feeRateText) };
    const v = validateAgentInput(candidate);
    if (!v.ok) {
      setErrors(v.errors);
      focusFirstError(v.errors);
      return;
    }
    setSubmitting(true);
    const res = await apiJson<Omit<AgentView, "createdAt" | "updatedAt"> & { createdAt: string; updatedAt: string }>(
      mode === "create" ? "/api/agents" : `/api/agents/${agentId}`,
      { method: mode === "create" ? "POST" : "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(v.data) },
    );
    setSubmitting(false);
    if (!res.ok) {
      const details = res.error.details as { fieldErrors?: FieldErrors } | undefined;
      if (details?.fieldErrors) {
        setErrors(details.fieldErrors);
        focusFirstError(details.fieldErrors);
      }
      setFormError(res.error.message);
      return;
    }
    onSaved(withDates(res.data));
  }

  const err = (k: AgentFieldKey) => (errors[k] ? t(`agentForm.errors.${errors[k]}`) : null);
  const inputProps = (k: AgentFieldKey) => ({
    id: id(k),
    className: cn("input", errors[k] && "border-rose-400"),
    "aria-invalid": !!errors[k],
    "aria-describedby": errors[k] ? `${id(k)}-err` : undefined,
  });

  return (
    <form onSubmit={onSubmit} className="card space-y-6 p-6" aria-busy={submitting} noValidate>
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-slate-800">{t("agentForm.sectionAccount")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id={id("agentCode")} label={t("agentForm.agentCode")} help={mode === "create" ? t("agentForm.agentCodeHelpCreate") : t("agentForm.agentCodeHelpEdit")}>
            <input id={id("agentCode")} className="input bg-slate-50 font-mono text-slate-700" value={agentCode} readOnly aria-readonly="true" />
          </FormField>
          <FormField id={id("feeRate")} label={t("agentForm.feeRate")} required error={err("feeRate")} help={t("agentForm.feeRateHelp")}>
            <div className="flex items-center gap-2">
              <input
                {...inputProps("feeRate")}
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                step={0.01}
                value={feeRateText}
                onChange={(e) => {
                  setFeeRateText(e.target.value);
                  setErrors((er) => ({ ...er, feeRate: undefined }));
                }}
              />
              <span className="text-sm text-slate-500">%</span>
            </div>
          </FormField>
        </div>
        {mode === "edit" && (
          <SegmentedControl<AgentStatus>
            label={t("agentForm.status")}
            value={values.status}
            onChange={(v) => set("status", v)}
            options={[
              { value: "active", label: t("common.enabled"), activeClass: "bg-emerald-50 text-emerald-900 ring-emerald-400" },
              { value: "disabled", label: t("common.disabled"), activeClass: "bg-slate-100 text-slate-800 ring-slate-400" },
            ]}
          />
        )}
      </section>

      <section className="space-y-4 border-t border-slate-100 pt-5">
        <h2 className="text-sm font-semibold text-slate-800">{t("agentForm.sectionCompany")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id={id("name")} label={t("agentForm.name")} required error={err("name")}>
            <input {...inputProps("name")} value={values.name} onChange={(e) => set("name", e.target.value)} maxLength={120} />
          </FormField>
          <FormField id={id("nameKana")} label={t("agentForm.nameKana")} required error={err("nameKana")} help={t("agentForm.nameKanaHelp")}>
            <input {...inputProps("nameKana")} value={values.nameKana} onChange={(e) => set("nameKana", e.target.value)} maxLength={120} placeholder={KANA_PLACEHOLDER} />
          </FormField>
          <FormField id={id("companyName")} label={t("agentForm.companyName")} required error={err("companyName")}>
            <input {...inputProps("companyName")} value={values.companyName} onChange={(e) => set("companyName", e.target.value)} maxLength={120} />
          </FormField>
          <FormField id={id("contactName")} label={t("agentForm.contactName")} required error={err("contactName")}>
            <input {...inputProps("contactName")} value={values.contactName} onChange={(e) => set("contactName", e.target.value)} maxLength={80} />
          </FormField>
          <FormField id={id("email")} label={t("agentForm.email")} required error={err("email")}>
            <input {...inputProps("email")} type="email" value={values.email} onChange={(e) => set("email", e.target.value)} maxLength={200} placeholder="partner@example.jp" />
          </FormField>
        </div>
      </section>

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
        <button type="submit" className="btn-primary" disabled={submitting || missingRequired}>
          {submitting ? t("common.processing") : mode === "create" ? t("agentForm.submitCreate") : t("agentForm.submitUpdate")}
        </button>
      </div>
      {missingRequired && <p className="text-right text-xs text-slate-400">{t("agentForm.missingRequired")}</p>}
    </form>
  );
}
