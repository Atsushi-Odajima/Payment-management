import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { getProviderDefinition, CATEGORIES } from "@/lib/providers/registry";
import {
  PAYMENT_STATUS_COLOR,
  PAYMENT_STATUS_LABEL,
  cn,
  formatDateTime,
  formatYen,
} from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [providers, payments, capturedAggregate, todayAggregate] =
    await Promise.all([
      prisma.paymentProvider.findMany({
        orderBy: { createdAt: "desc" },
      }),
      prisma.payment.findMany({
        orderBy: { createdAt: "desc" },
        take: 6,
        include: { provider: true },
      }),
      prisma.payment.aggregate({
        _sum: { amount: true },
        _count: true,
        where: { status: "captured" },
      }),
      prisma.payment.aggregate({
        _sum: { amount: true },
        _count: true,
        where: {
          status: "captured",
          capturedAt: { gte: startOfToday() },
        },
      }),
    ]);

  const activeProviders = providers.filter((p) => p.status === "active").length;

  const categoryCounts = CATEGORIES.map((c) => ({
    ...c,
    count: providers.filter((p) => p.category === c.key).length,
  }));

  return (
    <div>
      <PageHeader
        title="決済管理ダッシュボード"
        description="登録済みの決済プロバイダと最新の取引を一覧で確認できます。"
        actions={
          <>
            <Link href="/providers/new" className="btn-primary">
              ＋ 決済プロバイダを追加
            </Link>
            <Link href="/payments/new" className="btn-secondary">
              ＋ 決済を作成
            </Link>
          </>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="登録プロバイダ"
          value={`${providers.length} 件`}
          sub={`${activeProviders} 件が有効`}
        />
        <Stat
          label="累計売上"
          value={formatYen(capturedAggregate._sum.amount ?? 0)}
          sub={`${capturedAggregate._count} 件の確定決済`}
        />
        <Stat
          label="本日の売上"
          value={formatYen(todayAggregate._sum.amount ?? 0)}
          sub={`${todayAggregate._count} 件`}
        />
        <Stat
          label="対応カテゴリ"
          value={`${CATEGORIES.length} 種類`}
          sub="銀行/クレジット/コンビニ/QR/その他"
        />
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-900">最近の決済</h2>
            <Link href="/payments" className="text-xs text-brand-700 hover:underline">
              すべて見る →
            </Link>
          </div>
          {payments.length === 0 ? (
            <EmptyHint
              text="まだ決済がありません。プロバイダを接続して、デモ決済を作成してみましょう。"
              cta={{ href: "/payments/new", label: "決済を作成" }}
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {payments.map((p) => {
                const def = getProviderDefinition(p.provider.providerKey);
                return (
                  <li key={p.id} className="flex items-center justify-between px-5 py-3">
                    <div className="min-w-0">
                      <Link
                        href={`/payments/${p.id}`}
                        className="block truncate text-sm font-medium text-slate-900 hover:text-brand-700"
                      >
                        {p.orderNumber}
                      </Link>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {def?.name ?? p.provider.providerKey} ・ {formatDateTime(p.createdAt)}
                      </p>
                    </div>
                    <div className="ml-4 flex items-center gap-3">
                      <span className="text-sm font-semibold tabular-nums">
                        {formatYen(p.amount)}
                      </span>
                      <span
                        className={cn(
                          "badge",
                          PAYMENT_STATUS_COLOR[p.status] ??
                            "bg-slate-100 text-slate-700 ring-slate-200",
                        )}
                      >
                        {PAYMENT_STATUS_LABEL[p.status] ?? p.status}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-900">カテゴリ別の接続数</h2>
          </div>
          <ul className="divide-y divide-slate-100">
            {categoryCounts.map((c) => (
              <li key={c.key} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">{c.label}</p>
                  <p className="text-xs text-slate-500">{c.description}</p>
                </div>
                <span className="text-sm font-semibold tabular-nums text-slate-700">
                  {c.count}
                </span>
              </li>
            ))}
          </ul>
          <div className="border-t border-slate-100 px-5 py-3">
            <Link
              href="/providers/new"
              className="text-xs font-medium text-brand-700 hover:underline"
            >
              ＋ 新しいプロバイダを接続する
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="card px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function EmptyHint({
  text,
  cta,
}: {
  text: string;
  cta: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <p className="text-sm text-slate-500">{text}</p>
      <Link href={cta.href} className="btn-primary">
        {cta.label}
      </Link>
    </div>
  );
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
