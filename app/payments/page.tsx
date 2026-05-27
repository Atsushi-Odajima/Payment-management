import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { getProviderDefinition } from "@/lib/providers/registry";
import {
  PAYMENT_STATUS_COLOR,
  PAYMENT_STATUS_LABEL,
  cn,
  formatDateTime,
  formatYen,
} from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "pending", label: PAYMENT_STATUS_LABEL.pending },
  { key: "authorized", label: PAYMENT_STATUS_LABEL.authorized },
  { key: "captured", label: PAYMENT_STATUS_LABEL.captured },
  { key: "cancelled", label: PAYMENT_STATUS_LABEL.cancelled },
  { key: "refunded", label: PAYMENT_STATUS_LABEL.refunded },
];

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams?: { status?: string };
}) {
  const status = searchParams?.status ?? "all";
  const where = status !== "all" ? { status } : {};

  const [payments, aggregate] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { provider: true },
    }),
    prisma.payment.aggregate({
      where: { ...where, status: "captured" },
      _sum: { amount: true },
      _count: true,
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="売上 / 決済一覧"
        description="決済の状況を一覧で確認できます。デモ環境では、登録済みプロバイダでダミー決済を作成・操作できます。"
        actions={
          <Link href="/payments/new" className="btn-primary">
            ＋ 決済を作成
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
          {STATUS_FILTERS.map((f) => (
            <Link
              key={f.key}
              href={f.key === "all" ? "/payments" : `/payments?status=${f.key}`}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition",
                status === f.key
                  ? "bg-brand-600 text-white"
                  : "text-slate-600 hover:bg-slate-100",
              )}
            >
              {f.label}
            </Link>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          確定売上: <span className="font-semibold text-slate-800">{formatYen(aggregate._sum.amount ?? 0)}</span>{" "}
          ({aggregate._count} 件)
        </p>
      </div>

      <div className="card overflow-hidden">
        {payments.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500">
            該当する決済はありません。
            <div className="mt-4">
              <Link href="/payments/new" className="btn-primary">
                決済を作成する
              </Link>
            </div>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">注文番号</th>
                <th className="px-5 py-3">プロバイダ</th>
                <th className="px-5 py-3">顧客</th>
                <th className="px-5 py-3 text-right">金額</th>
                <th className="px-5 py-3">状態</th>
                <th className="px-5 py-3">作成日時</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payments.map((p) => {
                const def = getProviderDefinition(p.provider.providerKey);
                return (
                  <tr key={p.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3 font-medium text-slate-900">
                      <Link href={`/payments/${p.id}`} className="hover:text-brand-700">
                        {p.orderNumber}
                      </Link>
                      {p.externalId && (
                        <p className="text-xs text-slate-500">{p.externalId}</p>
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-700">
                      {def?.name ?? p.provider.providerKey}
                      <p className="text-xs text-slate-500">
                        {p.provider.displayName}
                      </p>
                    </td>
                    <td className="px-5 py-3 text-slate-700">
                      {p.customerName ?? "—"}
                      {p.customerEmail && (
                        <p className="text-xs text-slate-500">{p.customerEmail}</p>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums font-semibold">
                      {formatYen(p.amount)}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={cn(
                          "badge",
                          PAYMENT_STATUS_COLOR[p.status] ??
                            "bg-slate-100 text-slate-700 ring-slate-200",
                        )}
                      >
                        {PAYMENT_STATUS_LABEL[p.status] ?? p.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">
                      {formatDateTime(p.createdAt)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/payments/${p.id}`}
                        className="text-xs font-medium text-brand-700 hover:underline"
                      >
                        詳細 →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
