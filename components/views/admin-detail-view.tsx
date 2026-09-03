"use client";

// Admin detail: read-only by default; "Edit" switches to the form. Master
// actions on the right: reissue a temporary password, reset two-factor.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { AdminForm } from "@/components/admin-form";
import { AdminStatusBadge, RoleBadge, RoleCapabilities } from "@/components/admin-badges";
import { DetailRow } from "@/components/ui/detail-row";
import { useApiJson, useFormatDateTime, useT } from "@/components/language-provider";
import { useConfirm } from "@/components/confirm-dialog";
import { useSession } from "@/components/session-provider";
import { useToast } from "@/components/toast";
import type { AdminView } from "@/lib/admin/types";

export function AdminDetailView({ admin: initial }: { admin: AdminView }) {
  const t = useT();
  const router = useRouter();
  const apiJson = useApiJson();
  const toast = useToast();
  const { confirm } = useConfirm();
  const { user } = useSession();
  const formatDate = useFormatDateTime();
  const [admin, setAdmin] = useState<AdminView>(initial);
  const [editing, setEditing] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function resetPassword() {
    const ok = await confirm({ title: t("adminDetail.resetPassword"), body: t("adminDetail.resetPasswordBody", { name: admin.name }), confirmLabel: t("adminDetail.resetPassword"), tone: "danger" });
    if (!ok) return;
    setBusy("password");
    const res = await apiJson<{ password: string }>(`/api/admins/${admin.id}/password`, { method: "POST" });
    setBusy(null);
    if (!res.ok) {
      toast.show(res.error.message, "error");
      return;
    }
    setTempPassword(res.data.password);
  }

  async function resetTotp() {
    const ok = await confirm({ title: t("adminDetail.resetTotp"), body: t("adminDetail.resetTotpBody", { name: admin.name }), confirmLabel: t("adminDetail.resetTotp"), tone: "danger" });
    if (!ok) return;
    setBusy("totp");
    const res = await apiJson(`/api/admins/${admin.id}/totp-reset`, { method: "POST" });
    setBusy(null);
    if (!res.ok) {
      toast.show(res.error.message, "error");
      return;
    }
    setAdmin((a) => ({ ...a, totpEnabled: false }));
    toast.show(t("adminDetail.resetTotpDone"));
    router.refresh();
  }

  return (
    <div>
      <PageHeader
        title={admin.name}
        description={`${admin.loginId} · ${admin.email}`}
        helpHref="/manual/admins"
        breadcrumbs={[{ label: t("admins.title"), href: "/admins" }, { label: admin.loginId }]}
        actions={
          editing ? (
            <span className="badge bg-amber-100 text-amber-800 ring-amber-200">{t("adminDetail.editing")}</span>
          ) : (
            <button type="button" className="btn-primary" onClick={() => setEditing(true)}>
              {t("adminDetail.edit")}
            </button>
          )
        }
      />
      {editing ? (
        <AdminForm
          mode="edit"
          adminId={admin.id}
          selfId={user?.id}
          initial={{ loginId: admin.loginId, name: admin.name, email: admin.email, role: admin.role, status: admin.status }}
          onCancel={() => setEditing(false)}
          onSaved={({ admin: saved }) => {
            setAdmin(saved);
            setEditing(false);
            toast.show(t("adminDetail.updated"));
            router.refresh();
          }}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <section className="card divide-y divide-slate-100" aria-labelledby="admin-info">
            <h2 id="admin-info" className="px-5 py-3 text-sm font-semibold text-slate-800">
              {t("adminDetail.sectionAccount")}
            </h2>
            <DetailRow label={t("adminForm.loginId")}>
              <span className="font-mono">{admin.loginId}</span>
            </DetailRow>
            <DetailRow label={t("adminForm.name")}>{admin.name}</DetailRow>
            <DetailRow label={t("adminForm.email")}>
              <a href={`mailto:${admin.email}`} className="text-brand-700 hover:underline">
                {admin.email}
              </a>
            </DetailRow>
            <DetailRow label={t("adminForm.role")}>
              <RoleBadge role={admin.role} />
            </DetailRow>
            <DetailRow label={t("adminDetail.capabilities")}>
              <RoleCapabilities role={admin.role} />
            </DetailRow>
            <DetailRow label={t("adminForm.status")}>
              <AdminStatusBadge status={admin.status} />
            </DetailRow>
            <DetailRow label={t("admins.thTotp")}>{admin.totpEnabled ? t("adminDetail.totpOn") : t("adminDetail.totpOff")}</DetailRow>
            <DetailRow label={t("admins.thLastLogin")}>{admin.lastLoginAt ? formatDate(admin.lastLoginAt) : t("adminDetail.never")}</DetailRow>
            <DetailRow label={t("admins.thCreatedAt")}>{formatDate(admin.createdAt)}</DetailRow>
            <DetailRow label={t("adminDetail.updatedAt")}>{formatDate(admin.updatedAt)}</DetailRow>
          </section>

          <aside className="space-y-4">
            <div className="card space-y-3 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("adminDetail.actions")}</p>
              <button type="button" className="btn-secondary w-full" disabled={busy !== null} onClick={resetPassword}>
                {busy === "password" ? t("common.processing") : t("adminDetail.resetPassword")}
              </button>
              {tempPassword && (
                <div role="status" aria-live="polite" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                  <p>{t("adminDetail.resetPasswordDone")}</p>
                  <p className="mt-1 font-mono text-sm font-semibold tracking-wider">{tempPassword}</p>
                </div>
              )}
              <button type="button" className="btn-secondary w-full" disabled={busy !== null || !admin.totpEnabled} onClick={resetTotp}>
                {busy === "totp" ? t("common.processing") : t("adminDetail.resetTotp")}
              </button>
              {!admin.totpEnabled && <p className="text-[11px] text-slate-400">{t("adminDetail.resetTotpHint")}</p>}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
