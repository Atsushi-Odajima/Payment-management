import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { NewPaymentForm } from "@/components/new-payment-form";
import { getCategory, getProviderDefinition } from "@/lib/providers/registry";

export const dynamic = "force-dynamic";

export default async function NewPaymentPage() {
  const providers = await prisma.paymentProvider.findMany({
    where: { status: "active" },
    orderBy: { createdAt: "desc" },
  });
  const options = providers.map((p) => {
    const def = getProviderDefinition(p.providerKey);
    return {
      id: p.id,
      displayName: p.displayName,
      providerName: def?.name ?? p.providerKey,
      categoryLabel: getCategory(p.category)?.label ?? p.category,
      testMode: p.testMode,
    };
  });

  return (
    <div>
      <PageHeader
        title="決済を作成"
        description="登録済みのプロバイダでデモ決済を作成します。テストモード/本番モードは各プロバイダの設定に従います。"
        breadcrumbs={[{ label: "売上 / 決済一覧", href: "/payments" }, { label: "決済を作成" }]}
      />

      {options.length === 0 ? (
        <div className="card flex flex-col items-center justify-center p-10 text-center">
          <p className="text-sm font-medium text-slate-800">
            有効な決済プロバイダがありません
          </p>
          <p className="mt-1 text-sm text-slate-500">
            まず決済プロバイダを接続してください。
          </p>
          <Link href="/providers/new" className="btn-primary mt-4">
            ＋ プロバイダを接続
          </Link>
        </div>
      ) : (
        <NewPaymentForm providers={options} />
      )}
    </div>
  );
}
