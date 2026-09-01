"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { pickText, type Lang } from "@/lib/i18n";
import { getProviderDefinition } from "@/lib/providers/registry";
import type { ProviderField } from "@/lib/providers/types";
import { useApiFetch, useLang, useT } from "./language-provider";

interface EditRecord {
  id: string;
  displayName: string;
  status: string;
  testMode: boolean;
}

type InitialFields = Record<string, { value: string; masked: boolean }>;

export function ProviderForm(
  props:
    | { providerKey: string }
    | {
        providerKey: string;
        record: EditRecord;
        initialFields: InitialFields;
      },
) {
  const router = useRouter();
  const t = useT();
  const { lang } = useLang();
  const apiFetch = useApiFetch();

  const def = getProviderDefinition(props.providerKey);
  const record = "record" in props ? props.record : null;
  const initialFields = "record" in props ? props.initialFields : null;
  const isEdit = record !== null;

  const [displayName, setDisplayName] = useState(
    record ? record.displayName : def ? pickText(def.name, lang) : "",
  );
  const [testMode, setTestMode] = useState(record ? record.testMode : true);
  const [status, setStatus] = useState(record ? record.status : "active");

  // For edit mode, secret fields show the mask as placeholder; leaving the
  // field empty means "keep existing value".
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    if (def && initialFields) {
      for (const f of def.fields) {
        const stored = initialFields[f.key];
        if (!stored) continue;
        if (!f.secret) initial[f.key] = stored.value;
      }
    }
    return initial;
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<
    null | { ok: boolean; message: string }
  >(null);

  if (!def) return null;

  function setField(key: string, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!def) return;
    setError(null);
    setSubmitting(true);
    try {
      const url = record ? `/api/providers/${record.id}` : "/api/providers";
      const method = record ? "PATCH" : "POST";
      const res = await apiFetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          providerKey: def.key,
          displayName,
          testMode,
          status,
          credentials: values,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? t("providerForm.saveFailed"));
      if (!record) {
        router.push(`/providers/${data.id}?created=1`);
      } else {
        router.refresh();
        setTestResult({ ok: true, message: t("providerForm.updated") });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("common.genericError"));
    } finally {
      setSubmitting(false);
    }
  }

  async function onTestConnection() {
    if (!def) return;
    setTestResult(null);
    setSubmitting(true);
    try {
      if (!record) {
        // ephemeral test against current form values
        const res = await apiFetch(`/api/providers/test`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            providerKey: def.key,
            credentials: values,
            testMode,
          }),
        });
        const data = await res.json();
        setTestResult({
          ok: !!data.ok,
          message:
            data.message ??
            (data.ok
              ? t("providerForm.connectionOk")
              : t("providerForm.connectionFailed")),
        });
      } else {
        const res = await apiFetch(`/api/providers/${record.id}/test`, {
          method: "POST",
        });
        const data = await res.json();
        setTestResult({
          ok: !!data.ok,
          message:
            data.message ??
            (data.ok
              ? t("providerForm.connectionOk")
              : t("providerForm.connectionFailed")),
        });
        router.refresh();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete() {
    if (!record) return;
    if (!confirm(t("providerForm.confirmDelete", { name: record.displayName })))
      return;
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/providers/${record.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(t("providerForm.deleteFailed"));
      router.push("/providers");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("common.genericError"));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-5 p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="displayName">
            {t("providerForm.displayName")} <span className="text-rose-600">*</span>
          </label>
          <input
            id="displayName"
            className="input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
          />
          <p className="help">{t("providerForm.displayNameHelp")}</p>
        </div>
        {def.supportsTestMode && (
          <div>
            <span className="label">{t("providerForm.mode")}</span>
            <div className="flex overflow-hidden rounded-lg border border-slate-300 bg-white text-sm">
              <button
                type="button"
                onClick={() => setTestMode(true)}
                className={cn(
                  "flex-1 px-3 py-2",
                  testMode
                    ? "bg-amber-50 text-amber-800"
                    : "text-slate-600 hover:bg-slate-50",
                )}
              >
                {t("providerForm.testSandbox")}
              </button>
              <button
                type="button"
                onClick={() => setTestMode(false)}
                className={cn(
                  "flex-1 px-3 py-2",
                  !testMode
                    ? "bg-emerald-50 text-emerald-800"
                    : "text-slate-600 hover:bg-slate-50",
                )}
              >
                {t("providerForm.liveProduction")}
              </button>
            </div>
            <p className="help">{t("providerForm.modeHelp")}</p>
          </div>
        )}
      </div>

      <div className="space-y-4 border-t border-slate-100 pt-5">
        <h3 className="text-sm font-semibold text-slate-800">
          {t("providerForm.apiCredentials")}
        </h3>
        {def.fields.map((field) => (
          <FieldInput
            key={field.key}
            field={field}
            lang={lang}
            value={values[field.key] ?? ""}
            placeholder={
              isEdit && field.secret
                ? initialFields?.[field.key]?.value || field.placeholder
                : field.placeholder
            }
            onChange={(v) => setField(field.key, v)}
            secretLeaveBlankHint={isEdit && !!field.secret}
          />
        ))}
      </div>

      {isEdit && (
        <div className="border-t border-slate-100 pt-5">
          <span className="label">{t("providerForm.enabledDisabled")}</span>
          <div className="flex overflow-hidden rounded-lg border border-slate-300 bg-white text-sm">
            <button
              type="button"
              onClick={() => setStatus("active")}
              className={cn(
                "flex-1 px-3 py-2",
                status === "active"
                  ? "bg-emerald-50 text-emerald-800"
                  : "text-slate-600 hover:bg-slate-50",
              )}
            >
              {t("common.enabled")}
            </button>
            <button
              type="button"
              onClick={() => setStatus("disabled")}
              className={cn(
                "flex-1 px-3 py-2",
                status === "disabled"
                  ? "bg-slate-200 text-slate-700"
                  : "text-slate-600 hover:bg-slate-50",
              )}
            >
              {t("common.disabled")}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}
      {testResult && (
        <div
          className={cn(
            "rounded-lg border px-4 py-3 text-sm",
            testResult.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800",
          )}
        >
          {testResult.message}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-5">
        <div className="flex gap-2">
          <button type="submit" className="btn-primary" disabled={submitting}>
            {isEdit
              ? t("providerForm.saveChanges")
              : t("providerForm.saveConnection")}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={onTestConnection}
            disabled={submitting}
          >
            {t("providerForm.testConnection")}
          </button>
        </div>
        {isEdit && (
          <button
            type="button"
            className="btn-danger"
            onClick={onDelete}
            disabled={submitting}
          >
            {t("providerForm.deleteConnection")}
          </button>
        )}
      </div>
    </form>
  );
}

function FieldInput({
  field,
  lang,
  value,
  placeholder,
  onChange,
  secretLeaveBlankHint,
}: {
  field: ProviderField;
  lang: Lang;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  secretLeaveBlankHint: boolean;
}) {
  const t = useT();
  const common = {
    id: field.key,
    name: field.key,
    value,
    placeholder,
    required: field.required && !secretLeaveBlankHint,
    onChange: (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) => onChange(e.target.value),
  };

  let control: React.ReactNode;
  if (field.type === "textarea") {
    control = <textarea {...common} className="input min-h-[90px]" />;
  } else if (field.type === "select") {
    control = (
      <select {...common} className="input">
        <option value="">{t("common.select")}</option>
        {field.options?.map((o) => (
          <option key={o.value} value={o.value}>
            {pickText(o.label, lang)}
          </option>
        ))}
      </select>
    );
  } else {
    const inputType =
      field.type === "password"
        ? "password"
        : field.type === "url"
          ? "url"
          : field.type === "email"
            ? "email"
            : "text";
    control = (
      <input {...common} type={inputType} className="input" autoComplete="off" />
    );
  }

  return (
    <div>
      <label className="label" htmlFor={field.key}>
        {pickText(field.label, lang)}
        {field.required && <span className="ml-1 text-rose-600">*</span>}
        {field.secret && (
          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-600">
            {t("providerForm.encryptedBadge")}
          </span>
        )}
      </label>
      {control}
      {field.helpText && <p className="help">{pickText(field.helpText, lang)}</p>}
      {secretLeaveBlankHint && <p className="help">{t("providerForm.secretKeepHint")}</p>}
    </div>
  );
}
