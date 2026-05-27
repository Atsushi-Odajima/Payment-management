"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ProviderDefinition, ProviderField } from "@/lib/providers/types";

type Mode =
  | { kind: "create"; provider: ProviderDefinition }
  | {
      kind: "edit";
      provider: ProviderDefinition;
      record: {
        id: string;
        displayName: string;
        status: string;
        testMode: boolean;
      };
      initialFields: Record<string, { value: string; masked: boolean }>;
    };

export function ProviderForm(
  props:
    | { provider: ProviderDefinition }
    | {
        provider: ProviderDefinition;
        record: {
          id: string;
          displayName: string;
          status: string;
          testMode: boolean;
        };
        initialFields: Record<string, { value: string; masked: boolean }>;
      },
) {
  const router = useRouter();
  const mode: Mode =
    "record" in props
      ? {
          kind: "edit",
          provider: props.provider,
          record: props.record,
          initialFields: props.initialFields,
        }
      : { kind: "create", provider: props.provider };

  const def = mode.provider;

  const [displayName, setDisplayName] = useState(
    mode.kind === "edit" ? mode.record.displayName : def.name,
  );
  const [testMode, setTestMode] = useState(
    mode.kind === "edit" ? mode.record.testMode : true,
  );
  const [status, setStatus] = useState(
    mode.kind === "edit" ? mode.record.status : "active",
  );

  // For edit mode, secret fields show the mask as placeholder; leaving the
  // field empty means "keep existing value".
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    if (mode.kind === "edit") {
      for (const f of def.fields) {
        const stored = mode.initialFields[f.key];
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

  function setField(key: string, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const url =
        mode.kind === "create"
          ? "/api/providers"
          : `/api/providers/${mode.record.id}`;
      const method = mode.kind === "create" ? "POST" : "PATCH";
      const res = await fetch(url, {
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
      if (!res.ok) throw new Error(data?.error ?? "保存に失敗しました");
      if (mode.kind === "create") {
        router.push(`/providers/${data.id}?created=1`);
      } else {
        router.refresh();
        setTestResult({ ok: true, message: "設定を更新しました。" });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setSubmitting(false);
    }
  }

  async function onTestConnection() {
    setTestResult(null);
    setSubmitting(true);
    try {
      const id = mode.kind === "edit" ? mode.record.id : null;
      if (!id) {
        // ephemeral test against current form values
        const res = await fetch(`/api/providers/test`, {
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
          message: data.message ?? (data.ok ? "接続成功" : "接続失敗"),
        });
      } else {
        const res = await fetch(`/api/providers/${id}/test`, {
          method: "POST",
        });
        const data = await res.json();
        setTestResult({
          ok: !!data.ok,
          message: data.message ?? (data.ok ? "接続成功" : "接続失敗"),
        });
        router.refresh();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete() {
    if (mode.kind !== "edit") return;
    if (
      !confirm(
        `「${mode.record.displayName}」の接続を削除します。よろしいですか？関連する決済履歴も削除されます。`,
      )
    )
      return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/providers/${mode.record.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("削除に失敗しました");
      router.push("/providers");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-5 p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="displayName">
            管理用の表示名 <span className="text-rose-600">*</span>
          </label>
          <input
            id="displayName"
            className="input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
          />
          <p className="help">複数アカウントを使う場合に区別するための名前です。</p>
        </div>
        {def.supportsTestMode && (
          <div>
            <span className="label">モード</span>
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
                テスト (Sandbox)
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
                本番 (Live)
              </button>
            </div>
            <p className="help">最初はテストモードでの接続を推奨します。</p>
          </div>
        )}
      </div>

      <div className="space-y-4 border-t border-slate-100 pt-5">
        <h3 className="text-sm font-semibold text-slate-800">API認証情報</h3>
        {def.fields.map((field) => (
          <FieldInput
            key={field.key}
            field={field}
            value={values[field.key] ?? ""}
            placeholder={
              mode.kind === "edit" && field.secret
                ? mode.initialFields[field.key]?.value || field.placeholder
                : field.placeholder
            }
            onChange={(v) => setField(field.key, v)}
            secretLeaveBlankHint={mode.kind === "edit" && !!field.secret}
          />
        ))}
      </div>

      {mode.kind === "edit" && (
        <div className="border-t border-slate-100 pt-5">
          <span className="label">有効/無効</span>
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
              有効
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
              無効
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
            {mode.kind === "create" ? "接続を保存" : "変更を保存"}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={onTestConnection}
            disabled={submitting}
          >
            接続テスト
          </button>
        </div>
        {mode.kind === "edit" && (
          <button
            type="button"
            className="btn-danger"
            onClick={onDelete}
            disabled={submitting}
          >
            この接続を削除
          </button>
        )}
      </div>
    </form>
  );
}

function FieldInput({
  field,
  value,
  placeholder,
  onChange,
  secretLeaveBlankHint,
}: {
  field: ProviderField;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  secretLeaveBlankHint: boolean;
}) {
  const common = {
    id: field.key,
    name: field.key,
    value,
    placeholder,
    required: field.required && !secretLeaveBlankHint,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      onChange(e.target.value),
  };

  let control: React.ReactNode;
  if (field.type === "textarea") {
    control = <textarea {...common} className="input min-h-[90px]" />;
  } else if (field.type === "select") {
    control = (
      <select {...common} className="input">
        <option value="">選択してください</option>
        {field.options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
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
        {field.label}
        {field.required && <span className="ml-1 text-rose-600">*</span>}
        {field.secret && (
          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-600">
            暗号化保存
          </span>
        )}
      </label>
      {control}
      {field.helpText && <p className="help">{field.helpText}</p>}
      {secretLeaveBlankHint && (
        <p className="help">
          空欄のまま保存すると、既存の値が維持されます（マスク表示中）。
        </p>
      )}
    </div>
  );
}
