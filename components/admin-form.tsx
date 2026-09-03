"use client";

// Admin account form (create = invite, edit = detail screen). Validation runs
// client-side with the shared Zod schema and again on the server; server
// field errors (e.g. "taken") land in the same inline slots.

import { useId, useState } from "react";
import { useApiJson, useT } from "./language-provider";
import { FormField } from "./ui/form-field";
import { SegmentedControl } from "./ui/segmented-control";
import { REQUIRED_ADMIN_FIELDS, validateAdminCreate, validateAdminInput, type AdminErrorCode, type AdminFieldKey } from "@/lib/admin/schema";
import type { AdminCreateInput, AdminView } from "@/lib/admin/types";
import { cn } from "@/lib/utils";

type FieldErrors = Partial<Record<AdminFieldKey, AdminErrorCode>>;

export interface AdminSaved {
  admin: AdminView;
  /** Only on create: the generated initial password (shown once). */
  initialPassword?: string;
}

export function AdminForm({
  mode,
  adminId,
  initial,
  selfId,
  onSaved,
  onCancel,
}: {
  mode: "create" | "edit";
  adminId?: string;
  initial: AdminCreateInput;
  /** The signed-in admin: role / status of oneself are locked. */
  selfId?: string;
  onSaved: (saved: AdminSaved) => void;
  onCancel?: () => void;
}) {
  const t = useT();
  const apiJson = useApiJson();
  const formId = useId();
  const [values, setValues] = useState<AdminCreateInput>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const isSelf = mode === "edit" && adminId === selfId;
  const id = (k: string) => `${formId}-${k}`;

  function set<K extends AdminFieldKey>(key: K, value: AdminCreateInput[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  const missingRequired = REQUIRED_ADMIN_FIELDS.some((k) => (mode === "create" || k !== "loginId") && String(values[k] ?? "").trim() === "");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const v = mode === "create" ? validateAdminCreate(values) : validateAdminInput(values);
    if (!v.ok) {
      setErrors(v.errors);
      const first = (Object.keys(v.errors) as AdminFieldKey[])[0];
      document.getElementById(id(first))?.focus();
      return;
    }
    setSubmitting(true);
    type Wire = Omit<AdminView, "createdAt" | "updatedAt" | "lastLoginAt"> & { createdAt: string; updatedAt: string; lastLoginAt: string | null };
    const res = await apiJson<Wire | { admin: Wire; initialPassword: string }>(mode === "create" ? "/api/admins" : `/api/admins/${adminId}`, {
      method: mode === "create" ? "POST" : "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(v.data),
    });
    setSubmitting(false);
    if (!res.ok) {
      const details = res.error.details as { fieldErrors?: FieldErrors } | undefined;
      if (details?.fieldErrors) setErrors(details.fieldErrors);
      setFormError(res.error.message);
      return;
    }
    const withDates = (a: Wire): AdminView => ({ ...a, createdAt: new Date(a.createdAt), updatedAt: new Date(a.updatedAt), lastLoginAt: a.lastLoginAt ? new Date(a.lastLoginAt) : null });
    if ("admin" in res.data) onSaved({ admin: withDates(res.data.admin), initialPassword: res.data.initialPassword });
    else onSaved({ admin: withDates(res.data) });
  }

  const err = (k: AdminFieldKey) => (errors[k] ? t(`adminForm.errors.${errors[k]}`) : null);

  return (
    <form onSubmit={onSubmit} className="card space-y-6 p-6" aria-busy={submitting} noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id={id("loginId")} label={t("adminForm.loginId")} required={mode === "create"} error={err("loginId")} help={mode === "create" ? t("adminForm.loginIdHelp") : t("adminForm.loginIdLocked")}>
          <input
            id={id("loginId")}
            className={cn("input font-mono", errors.loginId && "border-rose-400", mode === "edit" && "bg-slate-50 text-slate-700")}
            value={values.loginId}
            onChange={(e) => set("loginId", e.target.value.toLowerCase())}
            readOnly={mode === "edit"}
            maxLength={32}
            autoCapitalize="none"
            aria-invalid={!!errors.loginId}
          />
        </FormField>
        <FormField id={id("name")} label={t("adminForm.name")} required error={err("name")}>
          <input id={id("name")} className={cn("input", errors.name && "border-rose-400")} value={values.name} onChange={(e) => set("name", e.target.value)} maxLength={80} aria-invalid={!!errors.name} />
        </FormField>
        <FormField id={id("email")} label={t("adminForm.email")} required error={err("email")}>
          <input id={id("email")} type="email" className={cn("input", errors.email && "border-rose-400")} value={values.email} onChange={(e) => set("email", e.target.value)} maxLength={200} aria-invalid={!!errors.email} />
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <SegmentedControl<"master" | "general">
            label={t("adminForm.role")}
            value={values.role}
            onChange={(v) => set("role", v)}
            options={[
              { value: "master", label: t("role.master") },
              { value: "general", label: t("role.general") },
            ]}
          />
          <p className="mt-1 text-xs text-slate-500">{isSelf ? t("adminForm.selfLocked") : t("adminForm.roleHelp")}</p>
        </div>
        {mode === "edit" && values.status !== "invited" && (
          <div>
            <SegmentedControl<"active" | "disabled">
              label={t("adminForm.status")}
              value={values.status === "disabled" ? "disabled" : "active"}
              onChange={(v) => set("status", v)}
              options={[
                { value: "active", label: t("adminEnums.status.active"), activeClass: "bg-emerald-50 text-emerald-900 ring-emerald-400" },
                { value: "disabled", label: t("adminEnums.status.disabled"), activeClass: "bg-slate-100 text-slate-800 ring-slate-400" },
              ]}
            />
          </div>
        )}
        {mode === "edit" && values.status === "invited" && (
          <div>
            <span className="label">{t("adminForm.status")}</span>
            <span className="badge bg-amber-100 text-amber-800 ring-amber-200">{t("adminEnums.status.invited")}</span>
            <p className="mt-1 text-xs text-slate-500">{t("adminForm.invitedHelp")}</p>
          </div>
        )}
      </div>

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
          {submitting ? t("common.processing") : mode === "create" ? t("adminForm.submitCreate") : t("adminForm.submitUpdate")}
        </button>
      </div>
      {missingRequired && <p className="text-right text-xs text-slate-400">{t("adminForm.missingRequired")}</p>}
    </form>
  );
}
