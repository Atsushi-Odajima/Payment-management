"use client";

// Merchant account form. Used for creation (/merchants/new) and, in edit
// mode, by the detail screen. Validation runs client-side (inline errors,
// scroll to the first problem) and again on the server; server field errors
// are merged back into the same inline slots.

import { useId, useMemo, useState } from "react";
import { useApiJson, useLang, useT } from "./language-provider";
import { NotificationPreview } from "./notification-preview";
import { CATEGORIES } from "@/lib/providers/registry";
import { pickText } from "@/lib/i18n";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/payments/methods";
import { TRANSFER_ID_DIGITS, type TransferIdDigits } from "@/lib/payments/transfer";
import { PASSWORD_MASK } from "@/lib/merchants/password-mask";
import {
  KANA_PLACEHOLDER,
  REQUIRED_MERCHANT_FIELDS,
  validateMerchantInput,
  type MerchantErrorCode,
  type MerchantFieldKey,
} from "@/lib/merchants/schema";
import {
  EMAIL_NOTIFICATIONS,
  NOTIFY_FORMATS,
  NOTIFY_ID_FORMATS,
  NOTIFY_PARAM_SETS,
  type AgentOption,
  type MerchantInput,
  type MerchantView,
} from "@/lib/merchants/types";
import { cn } from "@/lib/utils";

type FieldErrors = Partial<Record<MerchantFieldKey, MerchantErrorCode>>;

export interface MerchantFormProps {
  mode: "create" | "edit";
  /** Assigned code (edit) or the provisional next code (create). */
  merchantCode: string;
  initial: MerchantInput;
  /** Required in edit mode. */
  merchantId?: string;
  /** Rendered instead of the password input's mask slot (edit/detail supplies reveal UI). */
  passwordSlot?: React.ReactNode;
  onSaved: (merchant: MerchantView, extra?: { signingSecret?: { plaintext: string; key: { keyPrefix: string } } }) => void;
  onCancel?: () => void;
  /** Agents selectable as the referring agent. */
  agents: AgentOption[];
}

function withDates(m: Omit<MerchantView, "createdAt" | "updatedAt"> & { createdAt: string | Date; updatedAt: string | Date }): MerchantView {
  return { ...m, createdAt: new Date(m.createdAt), updatedAt: new Date(m.updatedAt) };
}

export function MerchantForm(props: MerchantFormProps) {
  const { mode, merchantCode, initial, merchantId, passwordSlot, onSaved, onCancel, agents } = props;
  const t = useT();
  const { lang } = useLang();
  const apiJson = useApiJson();
  const formId = useId();
  const [values, setValues] = useState<MerchantInput>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [sameEmail, setSameEmail] = useState(initial.email !== "" && initial.email === initial.statementEmail);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const missingRequired = REQUIRED_MERCHANT_FIELDS.some((k) => String(values[k] ?? "").trim() === "");

  function set<K extends MerchantFieldKey>(key: K, value: MerchantInput[K]) {
    setValues((v) => {
      const next = { ...v, [key]: value };
      if (key === "email" && sameEmail) next.statementEmail = value as string;
      return next;
    });
    setErrors((e) => ({ ...e, [key]: undefined, ...(key === "email" && sameEmail ? { statementEmail: undefined } : {}) }));
  }

  function toggleMethod(method: PaymentMethod, checked: boolean) {
    setValues((v) => ({
      ...v,
      enabledMethods: checked
        ? PAYMENT_METHODS.filter((m) => m === method || v.enabledMethods.includes(m))
        : v.enabledMethods.filter((m) => m !== method),
    }));
  }

  function toggleSameEmail(checked: boolean) {
    setSameEmail(checked);
    if (checked) {
      setValues((v) => ({ ...v, statementEmail: v.email }));
      setErrors((e) => ({ ...e, statementEmail: undefined }));
    }
  }

  function focusFirstError(errs: FieldErrors) {
    const first = (Object.keys(errs) as MerchantFieldKey[]).find((k) => errs[k]);
    if (!first) return;
    const el = document.getElementById(`${formId}-${first}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus({ preventScroll: true });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const v = validateMerchantInput(values);
    if (!v.ok) {
      setErrors(v.errors);
      focusFirstError(v.errors);
      return;
    }
    setSubmitting(true);
    const res = await apiJson<Omit<MerchantView, "createdAt" | "updatedAt"> & { createdAt: string; updatedAt: string; signingSecret?: { plaintext: string; key: { keyPrefix: string } } }>(
      mode === "create" ? "/api/merchants" : `/api/merchants/${merchantId}`,
      {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(v.data),
      },
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
    const { signingSecret, ...saved } = res.data;
    onSaved(withDates(saved), { signingSecret });
  }

  const errorText = (key: MerchantFieldKey) => {
    const code = errors[key];
    return code ? t(`merchantForm.errors.${code}`) : null;
  };

  const notifyConfig = useMemo(
    () => ({
      notifyUrl: values.notifyUrl,
      notifyFormat: values.notifyFormat,
      notifyParamSet: values.notifyParamSet,
      notifyIdFormat: values.notifyIdFormat,
    }),
    [values.notifyUrl, values.notifyFormat, values.notifyParamSet, values.notifyIdFormat],
  );

  return (
    <form onSubmit={onSubmit} className="card space-y-6 p-6" aria-busy={submitting} noValidate>
      {/* Account */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-slate-800">{t("merchantForm.sectionAccount")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor={`${formId}-merchantCode`}>
              {t("merchantForm.merchantCode")}
            </label>
            <input
              id={`${formId}-merchantCode`}
              className="input bg-slate-50 font-mono text-slate-700"
              value={merchantCode}
              readOnly
              aria-readonly="true"
            />
            <p className="help">
              {mode === "create" ? t("merchantForm.merchantCodeHelpCreate") : t("merchantForm.merchantCodeHelpEdit")}
            </p>
          </div>
          <div>
            <span className="label">{t("merchantForm.password")}</span>
            {passwordSlot ?? (
              <>
                <div className="input flex items-center justify-between bg-slate-50 font-mono text-slate-700">
                  <span aria-label={t("merchantForm.passwordMasked")}>{PASSWORD_MASK}</span>
                </div>
                <p className="help">{t("merchantForm.passwordHelpCreate")}</p>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Site / company */}
      <section className="space-y-4 border-t border-slate-100 pt-5">
        <h2 className="text-sm font-semibold text-slate-800">{t("merchantForm.sectionSite")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={`${formId}-siteName`} label={t("merchantForm.siteName")} required error={errorText("siteName")}>
            <input
              id={`${formId}-siteName`}
              className={cn("input", errors.siteName && "border-rose-400")}
              value={values.siteName}
              onChange={(e) => set("siteName", e.target.value)}
              maxLength={120}
              aria-invalid={!!errors.siteName}
              aria-describedby={errors.siteName ? `${formId}-siteName-err` : undefined}
            />
          </Field>
          <Field
            id={`${formId}-siteNameKana`}
            label={t("merchantForm.siteNameKana")}
            required
            error={errorText("siteNameKana")}
            help={t("merchantForm.siteNameKanaHelp")}
          >
            <input
              id={`${formId}-siteNameKana`}
              className={cn("input", errors.siteNameKana && "border-rose-400")}
              value={values.siteNameKana}
              onChange={(e) => set("siteNameKana", e.target.value)}
              maxLength={120}
              placeholder={KANA_PLACEHOLDER}
              aria-invalid={!!errors.siteNameKana}
              aria-describedby={errors.siteNameKana ? `${formId}-siteNameKana-err` : undefined}
            />
          </Field>
          <Field id={`${formId}-companyName`} label={t("merchantForm.companyName")} required error={errorText("companyName")}>
            <input
              id={`${formId}-companyName`}
              className={cn("input", errors.companyName && "border-rose-400")}
              value={values.companyName}
              onChange={(e) => set("companyName", e.target.value)}
              maxLength={120}
              aria-invalid={!!errors.companyName}
              aria-describedby={errors.companyName ? `${formId}-companyName-err` : undefined}
            />
          </Field>
          <Field id={`${formId}-contactName`} label={t("merchantForm.contactName")} required error={errorText("contactName")}>
            <input
              id={`${formId}-contactName`}
              className={cn("input", errors.contactName && "border-rose-400")}
              value={values.contactName}
              onChange={(e) => set("contactName", e.target.value)}
              maxLength={80}
              aria-invalid={!!errors.contactName}
              aria-describedby={errors.contactName ? `${formId}-contactName-err` : undefined}
            />
          </Field>
          <Field id={`${formId}-agentId`} label={t("merchantForm.agent")} error={errorText("agentId")} help={t("merchantForm.agentHelp")}>
            <select
              id={`${formId}-agentId`}
              className={cn("input", errors.agentId && "border-rose-400")}
              value={values.agentId ?? ""}
              onChange={(e) => set("agentId", e.target.value || null)}
              aria-invalid={!!errors.agentId}
            >
              <option value="">{t("merchantForm.agentNone")}</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.agentCode} — {a.name}
                  {a.status !== "active" ? ` (${t("common.disabled")})` : ""}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      {/* Payment methods / bank transfer */}
      <section className="space-y-4 border-t border-slate-100 pt-5">
        <h2 className="text-sm font-semibold text-slate-800">{t("merchantForm.sectionPayment")}</h2>
        <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
          <fieldset>
            <legend className="label">{t("merchantForm.enabledMethods")}</legend>
            <div className="flex flex-wrap gap-2">
              {PAYMENT_METHODS.map((m) => {
                const c = CATEGORIES.find((x) => x.key === m);
                const checked = values.enabledMethods.includes(m);
                return (
                  <label
                    key={m}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                      checked
                        ? "border-brand-400 bg-brand-50 text-brand-900 ring-1 ring-inset ring-brand-300"
                        : "border-slate-300 text-slate-700 hover:bg-slate-50",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => toggleMethod(m, e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-300"
                    />
                    {c ? pickText(c.label, lang) : m}
                  </label>
                );
              })}
            </div>
            <p className="help">{t("merchantForm.enabledMethodsHelp")}</p>
          </fieldset>
          <Field id={`${formId}-transferIdDigits`} label={t("merchantForm.transferIdDigits")} help={t("merchantForm.transferIdDigitsHelp")}>
            <select
              id={`${formId}-transferIdDigits`}
              className="input"
              value={values.transferIdDigits}
              onChange={(e) => set("transferIdDigits", Number(e.target.value) as TransferIdDigits)}
            >
              {TRANSFER_ID_DIGITS.map((d) => (
                <option key={d} value={d}>
                  {t("merchantForm.digits", { n: d })}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      {/* Contact */}
      <section className="space-y-4 border-t border-slate-100 pt-5">
        <h2 className="text-sm font-semibold text-slate-800">{t("merchantForm.sectionContact")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={`${formId}-email`} label={t("merchantForm.email")} required error={errorText("email")}>
            <input
              id={`${formId}-email`}
              type="email"
              className={cn("input", errors.email && "border-rose-400")}
              value={values.email}
              onChange={(e) => set("email", e.target.value)}
              maxLength={200}
              placeholder="contact@example.jp"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? `${formId}-email-err` : undefined}
            />
          </Field>
          <Field id={`${formId}-statementEmail`} label={t("merchantForm.statementEmail")} required error={errorText("statementEmail")}>
            <input
              id={`${formId}-statementEmail`}
              type="email"
              className={cn("input", errors.statementEmail && "border-rose-400", sameEmail && "bg-slate-50")}
              value={values.statementEmail}
              onChange={(e) => set("statementEmail", e.target.value)}
              maxLength={200}
              readOnly={sameEmail}
              placeholder="billing@example.jp"
              aria-invalid={!!errors.statementEmail}
              aria-describedby={errors.statementEmail ? `${formId}-statementEmail-err` : undefined}
            />
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={sameEmail}
                onChange={(e) => toggleSameEmail(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-300"
              />
              {t("merchantForm.sameAsEmail")}
            </label>
          </Field>
        </div>
      </section>

      {/* Notifications */}
      <section className="space-y-4 border-t border-slate-100 pt-5">
        <h2 className="text-sm font-semibold text-slate-800">{t("merchantForm.sectionNotify")}</h2>
        <Field
          id={`${formId}-notifyUrl`}
          label={t("merchantForm.notifyUrl")}
          required
          error={errorText("notifyUrl")}
          help={t("merchantForm.notifyUrlHelp")}
        >
          <input
            id={`${formId}-notifyUrl`}
            type="url"
            inputMode="url"
            className={cn("input font-mono", errors.notifyUrl && "border-rose-400")}
            value={values.notifyUrl}
            onChange={(e) => set("notifyUrl", e.target.value)}
            maxLength={500}
            placeholder="https://shop.example.jp/wirepay/notify"
            aria-invalid={!!errors.notifyUrl}
            aria-describedby={errors.notifyUrl ? `${formId}-notifyUrl-err` : undefined}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id={`${formId}-notifyFormat`} label={t("merchantForm.notifyFormat")}>
            <select
              id={`${formId}-notifyFormat`}
              className="input"
              value={values.notifyFormat}
              onChange={(e) => set("notifyFormat", e.target.value as MerchantInput["notifyFormat"])}
            >
              {NOTIFY_FORMATS.map((v) => (
                <option key={v} value={v}>
                  {t(`merchantEnums.notifyFormat.${v}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field id={`${formId}-notifyParamSet`} label={t("merchantForm.notifyParamSet")}>
            <select
              id={`${formId}-notifyParamSet`}
              className="input"
              value={values.notifyParamSet}
              onChange={(e) => set("notifyParamSet", e.target.value as MerchantInput["notifyParamSet"])}
            >
              {NOTIFY_PARAM_SETS.map((v) => (
                <option key={v} value={v}>
                  {t(`merchantEnums.notifyParamSet.${v}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field id={`${formId}-notifyIdFormat`} label={t("merchantForm.notifyIdFormat")}>
            <select
              id={`${formId}-notifyIdFormat`}
              className="input"
              value={values.notifyIdFormat}
              onChange={(e) => set("notifyIdFormat", e.target.value as MerchantInput["notifyIdFormat"])}
            >
              {NOTIFY_ID_FORMATS.map((v) => (
                <option key={v} value={v}>
                  {t(`merchantEnums.notifyIdFormat.${v}`)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <NotificationPreview config={notifyConfig} merchantCode={merchantCode} />
      </section>

      {/* Email notifications */}
      <section className="space-y-3 border-t border-slate-100 pt-5">
        <h2 className="text-sm font-semibold text-slate-800">{t("merchantForm.emailNotification")}</h2>
        <fieldset className="grid gap-2 sm:grid-cols-3">
          <legend className="sr-only">{t("merchantForm.emailNotification")}</legend>
          {EMAIL_NOTIFICATIONS.map((v) => (
            <label
              key={v}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                values.emailNotification === v
                  ? "border-brand-400 bg-brand-50 text-brand-900 ring-1 ring-inset ring-brand-300"
                  : "border-slate-300 text-slate-700 hover:bg-slate-50",
              )}
            >
              <input
                type="radio"
                name={`${formId}-emailNotification`}
                value={v}
                checked={values.emailNotification === v}
                onChange={() => set("emailNotification", v)}
                className="h-4 w-4 border-slate-300 text-brand-600 focus:ring-brand-300"
              />
              {t(`merchantEnums.emailNotification.${v}`)}
            </label>
          ))}
        </fieldset>
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
        <button
          type="submit"
          className="btn-primary"
          disabled={submitting || missingRequired}
          aria-describedby={missingRequired ? `${formId}-missing` : undefined}
        >
          {submitting
            ? t("common.processing")
            : mode === "create"
              ? t("merchantForm.submitCreate")
              : t("merchantForm.submitUpdate")}
        </button>
      </div>
      {missingRequired && (
        <p id={`${formId}-missing`} className="text-right text-xs text-slate-400">
          {t("merchantForm.missingRequired")}
        </p>
      )}
    </form>
  );
}

function Field({
  id,
  label,
  required,
  error,
  help,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string | null;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
        {required && <span className="ml-1 text-rose-600">*</span>}
      </label>
      {children}
      {help && !error && <p className="help">{help}</p>}
      {error && (
        <p id={`${id}-err`} role="alert" className="mt-1 text-xs text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}
