"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn, type ProviderStatus } from "@/lib/utils";
import { pickText, type Lang } from "@/lib/i18n";
import { getProviderDefinition } from "@/lib/providers/registry";
import type { ProviderField } from "@/lib/providers/types";
import type { DisplayField } from "@/lib/providers/credentials";
import { useApiJson, useConfirm, useLang, useT } from "./hooks";
import { SegmentedControl } from "./ui/segmented-control";
import { popFlash, pushFlash } from "@/lib/flash";

interface EditRecord {
  id: string;
  displayName: string;
  status: ProviderStatus;
  testMode: boolean;
  paymentsCount: number;
}

type InitialFields = Record<string, DisplayField>;

export function ProviderForm(
  props:
    | { providerKey: string }
    | { providerKey: string; record: EditRecord; initialFields: InitialFields },
) {
  const router = useRouter();
  const t = useT();
  const { lang } = useLang();
  const apiJson = useApiJson();
  const { confirm } = useConfirm();

  const def = getProviderDefinition(props.providerKey);
  const record = "record" in props ? props.record : null;
  const initialFields = "record" in props ? props.initialFields : null;
  const isEdit = record !== null;

  const [displayName, setDisplayName] = useState(
    record ? record.displayName : def ? pickText(def.name, lang) : "",
  );
  const [testMode, setTestMode] = useState(record ? record.testMode : true);
  const [status, setStatus] = useState<ProviderStatus>(record ? record.status : "active");
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    if (def && initialFields) {
      for (const f of def.fields) {
        const stored = initialFields[f.key];
        if (stored && !f.secret) initial[f.key] = stored.value;
      }
    }
    return initial;
  });
  // Secret fields the user chose to overwrite in edit mode.
  const [editingSecrets, setEditingSecrets] = useState<Record<string, boolean>>({});

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});
  const [testResult, setTestResult] = useState<null | { ok: boolean; message: string }>(() => {
    const flash = record ? popFlash(`provider:${record.id}`) : undefined;
    return flash ? { ok: true, message: flash } : null;
  });

  if (!def) return null;

  function setField(key: string, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
    setFieldErrors((e) => ({ ...e, [key]: false }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!def) return;
    setError(null);
    setTestResult(null);
    setSubmitting(true);
    const url = record ? `/api/providers/${record.id}` : "/api/providers";
    const res = await apiJson<{ id: string }>(url, {
      method: record ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ providerKey: def.key, displayName, testMode, status, credentials: values }),
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error.message);
      const details = res.error.details as { fieldErrors?: Record<string, unknown> } | undefined;
      if (details?.fieldErrors) {
        setFieldErrors(Object.fromEntries(Object.keys(details.fieldErrors).map((k) => [k, true])));
      }
      return;
    }
    if (!record) {
      router.push(`/providers/${res.data.id}?created=1`);
    } else {
      pushFlash(`provider:${record.id}`, t("providerForm.updated"));
      setTestResult({ ok: true, message: t("providerForm.updated") });
      router.refresh();
    }
  }

  async function onTestConnection() {
    if (!def) return;
    setTestResult(null);
    setError(null);
    setSubmitting(true);
    const res = record
      ? await apiJson<{ ok: boolean; message: string }>(`/api/providers/${record.id}/test`, { method: "POST" })
      : await apiJson<{ ok: boolean; message: string }>(`/api/providers/test`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ providerKey: def.key, credentials: values, testMode }),
        });
    setSubmitting(false);
    if (!res.ok) {
      setTestResult({ ok: false, message: res.error.message });
      return;
    }
    setTestResult({
      ok: res.data.ok,
      message: res.data.message || (res.data.ok ? t("providerForm.connectionOk") : t("providerForm.connectionFailed")),
    });
    if (record) router.refresh();
  }

  async function onDelete() {
    if (!record) return;
    const ok = await confirm({
      title: t("providerForm.deleteConnection"),
      body: t("providerForm.confirmDelete", { name: record.displayName }),
      confirmLabel: t("providerForm.deleteConnection"),
      tone: "danger",
    });
    if (!ok) return;
    setSubmitting(true);
    const res = await apiJson(`/api/providers/${record.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError(res.error.message);
      setSubmitting(false);
      return;
    }
    router.push("/providers");
  }

  const canDelete = isEdit && (record?.paymentsCount ?? 0) === 0;

  return (
    <form onSubmit={onSubmit} className="card space-y-5 p-6" aria-busy={submitting}>
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
            maxLength={80}
          />
          <p className="help">{t("providerForm.displayNameHelp")}</p>
        </div>
        {def.supportsTestMode && (
          <div>
            <SegmentedControl<"test" | "live">
              label={t("providerForm.mode")}
              value={testMode ? "test" : "live"}
              onChange={(v) => setTestMode(v === "test")}
              options={[
                { value: "test", label: t("providerForm.testSandbox"), activeClass: "bg-amber-50 text-amber-900 ring-amber-400" },
                { value: "live", label: t("providerForm.liveProduction"), activeClass: "bg-emerald-50 text-emerald-900 ring-emerald-400" },
              ]}
            />
            <p className="help">{t("providerForm.modeHelp")}</p>
          </div>
        )}
      </div>

      <div className="space-y-4 border-t border-slate-100 pt-5">
        <h3 className="text-sm font-semibold text-slate-800">{t("providerForm.apiCredentials")}</h3>
        {def.fields.map((field) => (
          <FieldInput
            key={field.key}
            field={field}
            lang={lang}
            value={values[field.key] ?? ""}
            stored={initialFields?.[field.key]}
            editMode={isEdit}
            editing={!field.secret || !isEdit || !!editingSecrets[field.key]}
            onStartEditing={() => setEditingSecrets((s) => ({ ...s, [field.key]: true }))}
            invalid={!!fieldErrors[field.key]}
            onChange={(v) => setField(field.key, v)}
          />
        ))}
      </div>

      {isEdit && (
        <div className="border-t border-slate-100 pt-5">
          <SegmentedControl<ProviderStatus>
            label={t("providerForm.enabledDisabled")}
            value={status}
            onChange={setStatus}
            options={[
              { value: "active", label: t("common.enabled"), activeClass: "bg-emerald-50 text-emerald-900 ring-emerald-400" },
              { value: "disabled", label: t("common.disabled"), activeClass: "bg-slate-100 text-slate-800 ring-slate-400" },
            ]}
          />
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}
      {testResult && (
        <div
          role="status"
          aria-live="polite"
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
            {isEdit ? t("providerForm.saveChanges") : t("providerForm.saveConnection")}
          </button>
          <button type="button" className="btn-secondary" onClick={onTestConnection} disabled={submitting}>
            {t("providerForm.testConnection")}
          </button>
        </div>
        {isEdit && (
          <div className="text-right">
            <button
              type="button"
              className="btn-danger"
              onClick={onDelete}
              disabled={submitting || !canDelete}
              aria-describedby={!canDelete ? "delete-hint" : undefined}
            >
              {t("providerForm.deleteConnection")}
            </button>
            {!canDelete && (
              <p id="delete-hint" className="mt-1 text-[11px] text-slate-400">
                {t("providerForm.deleteBlockedHint")}
              </p>
            )}
          </div>
        )}
      </div>
    </form>
  );
}

function FieldInput({
  field,
  lang,
  value,
  stored,
  editMode,
  editing,
  onStartEditing,
  invalid,
  onChange,
}: {
  field: ProviderField;
  lang: Lang;
  value: string;
  stored?: DisplayField;
  editMode: boolean;
  editing: boolean;
  onStartEditing: () => void;
  invalid: boolean;
  onChange: (v: string) => void;
}) {
  const t = useT();
  const helpId = `${field.key}-help`;
  const common = {
    id: field.key,
    name: field.key,
    value,
    placeholder: field.placeholder,
    // In edit mode a blank secret means "keep", so it is never required there.
    required: field.required && !(editMode && field.secret),
    "aria-invalid": invalid || undefined,
    "aria-describedby": field.helpText ? helpId : undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      onChange(e.target.value),
  };

  let control: React.ReactNode;
  if (!editing && stored) {
    // Stored secret: show the mask as text (not as a low-contrast placeholder)
    // plus an explicit "change" affordance.
    control = (
      <div className="flex items-center gap-2">
        <code className="input flex-1 truncate bg-slate-50 text-slate-700">
          {stored.undecryptable ? "—" : stored.value}
        </code>
        <button type="button" className="btn-secondary shrink-0" onClick={onStartEditing}>
          {t("providerForm.changeSecret")}
        </button>
      </div>
    );
  } else if (field.type === "textarea") {
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
      field.type === "password" ? "password" : field.type === "url" ? "url" : field.type === "email" ? "email" : "text";
    control = <input {...common} type={inputType} className="input" autoComplete="off" />;
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
      {field.helpText && (
        <p id={helpId} className="help">
          {pickText(field.helpText, lang)}
        </p>
      )}
      {stored?.undecryptable && (
        <p role="alert" className="mt-1 text-xs text-rose-700">
          {t("providerForm.undecryptable")}
        </p>
      )}
      {editMode && field.secret && editing && !stored?.undecryptable && (
        <p className="help">{t("providerForm.secretKeepHint")}</p>
      )}
    </div>
  );
}
