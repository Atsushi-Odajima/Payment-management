import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ProviderForm } from "@/components/provider-form";
import {
  getCategory,
  getProviderDefinition,
} from "@/lib/providers/registry";

export default function NewProviderConfigPage({
  params,
}: {
  params: { provider: string };
}) {
  const def = getProviderDefinition(params.provider);
  if (!def) notFound();
  const category = getCategory(def.category);

  return (
    <div>
      <PageHeader
        title={`${def.name} を接続`}
        description={def.description}
        breadcrumbs={[
          { label: "決済プロバイダ", href: "/providers" },
          { label: "新規接続", href: "/providers/new" },
          {
            label: category?.label ?? def.category,
            href: `/providers/new?category=${def.category}`,
          },
          { label: def.name },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <ProviderForm provider={def} />

        <aside className="space-y-4">
          <div className="card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              入力する情報
            </p>
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              {def.fields.map((f) => (
                <li key={f.key} className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                  <span>
                    {f.label}
                    {f.required && <span className="ml-1 text-rose-600">*</span>}
                    {f.secret && (
                      <span className="ml-2 text-xs text-slate-500">(暗号化)</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="card p-4 text-xs text-slate-600">
            <p className="font-semibold text-slate-800">セキュリティについて</p>
            <p className="mt-1">
              シークレットキーなどの機微情報は AES-256-GCM で暗号化してデータベースに保存します。
              管理画面上では末尾4文字以外マスクされ、復号は決済処理時にのみ行われます。
            </p>
          </div>
          {def.docsUrl && (
            <Link
              href={def.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="card block p-4 text-xs text-brand-700 hover:bg-brand-50/40"
            >
              {def.name} のAPIドキュメントを開く →
            </Link>
          )}
        </aside>
      </div>
    </div>
  );
}
