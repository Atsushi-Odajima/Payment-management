"use client";

// Invite an operator: the form, then a one-time panel with the generated
// initial password (the demo shows it instead of sending an email).

import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { AdminForm, type AdminSaved } from "@/components/admin-form";
import { useT } from "@/components/language-provider";
import { EMPTY_ADMIN_CREATE } from "@/lib/admin/schema";

export function AdminNewView() {
  const t = useT();
  const [saved, setSaved] = useState<AdminSaved | null>(null);
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!saved?.initialPassword) return;
    try {
      await navigator.clipboard.writeText(saved.initialPassword);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={t("adminForm.titleCreate")}
        description={t("adminForm.descriptionCreate")}
        helpHref="/manual/admins"
        breadcrumbs={[{ label: t("admins.title"), href: "/admins" }, { label: t("adminForm.titleCreate") }]}
      />
      {saved ? (
        <div className="card space-y-4 p-6" role="status" aria-live="polite">
          <p className="text-sm font-semibold text-slate-900">{t("adminForm.createdTitle")}</p>
          <p className="text-sm text-slate-600">{t("adminForm.createdBody", { name: saved.admin.name })}</p>
          <dl className="rounded-lg bg-slate-50 px-4 py-3 font-mono text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">{t("adminForm.loginId")}</dt>
              <dd>{saved.admin.loginId}</dd>
            </div>
            <div className="mt-1 flex justify-between gap-4">
              <dt className="text-slate-500">{t("adminForm.initialPassword")}</dt>
              <dd className="font-semibold tracking-wider">{saved.initialPassword}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={copy}>
              {copied ? t("adminForm.copied") : t("adminForm.copy")}
            </button>
            <Link href={`/admins/${saved.admin.id}`} className="btn-primary">
              {t("adminForm.openDetail")}
            </Link>
          </div>
        </div>
      ) : (
        <AdminForm mode="create" initial={EMPTY_ADMIN_CREATE} onSaved={setSaved} />
      )}
    </div>
  );
}
