import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { ProviderForm } from "@/components/provider-form";
import { readCredentialsForDisplay } from "@/lib/providers/credentials";
import {
  getCategory,
  getProviderDefinition,
} from "@/lib/providers/registry";
import { cn, formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function EditProviderPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { created?: string };
}) {
  const record = await prisma.paymentProvider.findUnique({
    where: { id: params.id },
    include: { _count: { select: { payments: true } } },
  });
  if (!record) notFound();
  const def = getProviderDefinition(record.providerKey);
  if (!def) notFound();
  const category = getCategory(def.category);
  const view = readCredentialsForDisplay(def.key, record.credentials);

  return (
    <div>
      <PageHeader
        title={record.displayName}
        description={`${def.name} ・ ${category?.label ?? def.category}`}
        breadcrumbs={[
          { label: "決済プロバイダ", href: "/providers" },
          { label: record.displayName },
        ]}
        actions={
          <Link href="/payments/new" className="btn-secondary">
            この決済でテスト決済を作成
          </Link>
        }
      />

      {searchParams?.created === "1" && (
        <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          ✓ プロバイダを接続しました。「接続テスト」で疎通を確認できます。
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <ProviderForm
          provider={def}
          record={{
            id: record.id,
            displayName: record.displayName,
            status: record.status,
            testMode: record.testMode,
          }}
          initialFields={view.fields}
        />

        <aside className="space-y-4">
          <div className="card p-4 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              ステータス
            </p>
            <div className="mt-2 space-y-2">
              <Row label="モード">
                <span
                  className={cn(
                    "badge",
                    record.testMode
                      ? "bg-amber-100 text-amber-800 ring-amber-200"
                      : "bg-emerald-100 text-emerald-800 ring-emerald-200",
                  )}
                >
                  {record.testMode ? "テスト" : "本番"}
                </span>
              </Row>
              <Row label="状態">
                <span
                  className={cn(
                    "badge",
                    record.status === "active"
                      ? "bg-emerald-100 text-emerald-800 ring-emerald-200"
                      : "bg-slate-200 text-slate-700 ring-slate-300",
                  )}
                >
                  {record.status === "active" ? "有効" : "無効"}
                </span>
              </Row>
              <Row label="紐づく決済">{record._count.payments} 件</Row>
              <Row label="最終テスト">
                {record.lastTestAt ? (
                  <span className="text-xs text-slate-700">
                    {formatDateTime(record.lastTestAt)}
                    <span
                      className={cn(
                        "ml-2",
                        record.lastTestOk
                          ? "text-emerald-700"
                          : "text-rose-700",
                      )}
                    >
                      {record.lastTestOk ? "✓" : "✗"}
                    </span>
                  </span>
                ) : (
                  <span className="text-xs text-slate-500">未実施</span>
                )}
              </Row>
              <Row label="登録日">
                <span className="text-xs text-slate-700">
                  {formatDateTime(record.createdAt)}
                </span>
              </Row>
            </div>
          </div>
          <div className="card p-4 text-xs text-slate-600">
            <p className="font-semibold text-slate-800">機微情報の取扱い</p>
            <p className="mt-1">
              シークレットキー類は AES-256-GCM で暗号化済みです。再表示時は末尾のみマスク表示されます。
              変更しない場合は空欄のまま保存してください。
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-slate-500">{label}</span>
      <span>{children}</span>
    </div>
  );
}
