import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import {
  CATEGORIES,
  getCategory,
  getProviderDefinition,
} from "@/lib/providers/registry";
import { cn, formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ProvidersPage() {
  const providers = await prisma.paymentProvider.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="決済プロバイダ"
        description="接続済みの決済サービスを管理します。各プロバイダの認証情報・有効/無効・接続テスト結果を確認できます。"
        actions={
          <Link href="/providers/new" className="btn-primary">
            ＋ 新規接続
          </Link>
        }
      />

      {providers.length === 0 ? (
        <div className="card flex flex-col items-center justify-center px-6 py-16 text-center">
          <p className="text-base font-medium text-slate-800">
            まだプロバイダが接続されていません
          </p>
          <p className="mt-1 text-sm text-slate-500">
            PayPay・クレジット・コンビニ・銀行振込など、必要な決済を選んで接続しましょう。
          </p>
          <Link href="/providers/new" className="btn-primary mt-6">
            ＋ 決済プロバイダを接続する
          </Link>
          <div className="mt-8 grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CATEGORIES.slice(0, 6).map((c) => (
              <Link
                key={c.key}
                href={`/providers/new?category=${c.key}`}
                className="rounded-lg border border-dashed border-slate-300 p-3 text-left text-xs text-slate-600 hover:border-brand-300 hover:bg-brand-50/40"
              >
                <p className="text-sm font-medium text-slate-800">{c.label}</p>
                <p className="mt-0.5 line-clamp-2">{c.description}</p>
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">プロバイダ</th>
                <th className="px-5 py-3">カテゴリ</th>
                <th className="px-5 py-3">モード</th>
                <th className="px-5 py-3">状態</th>
                <th className="px-5 py-3">最終テスト</th>
                <th className="px-5 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {providers.map((p) => {
                const def = getProviderDefinition(p.providerKey);
                const cat = getCategory(p.category);
                return (
                  <tr key={p.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <span
                          className="h-8 w-8 shrink-0 rounded-md"
                          style={{ background: def?.logoColor ?? "#94a3b8" }}
                          aria-hidden
                        />
                        <div>
                          <p className="font-medium text-slate-900">
                            {p.displayName}
                          </p>
                          <p className="text-xs text-slate-500">
                            {def?.name ?? p.providerKey}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {cat?.label ?? p.category}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={cn(
                          "badge",
                          p.testMode
                            ? "bg-amber-100 text-amber-800 ring-amber-200"
                            : "bg-emerald-100 text-emerald-800 ring-emerald-200",
                        )}
                      >
                        {p.testMode ? "テスト" : "本番"}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={cn(
                          "badge",
                          p.status === "active"
                            ? "bg-emerald-100 text-emerald-800 ring-emerald-200"
                            : "bg-slate-200 text-slate-700 ring-slate-300",
                        )}
                      >
                        {p.status === "active" ? "有効" : "無効"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">
                      {p.lastTestAt ? (
                        <>
                          {formatDateTime(p.lastTestAt)}
                          <span
                            className={cn(
                              "ml-2",
                              p.lastTestOk
                                ? "text-emerald-700"
                                : "text-rose-700",
                            )}
                          >
                            {p.lastTestOk ? "✓ 成功" : "✗ 失敗"}
                          </span>
                        </>
                      ) : (
                        "未実施"
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/providers/${p.id}`}
                        className="text-xs font-medium text-brand-700 hover:underline"
                      >
                        設定を編集 →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
