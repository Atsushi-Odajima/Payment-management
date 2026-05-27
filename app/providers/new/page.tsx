import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import {
  CATEGORIES,
  PROVIDERS,
  getCategory,
  providersByCategory,
} from "@/lib/providers/registry";

export default function NewProviderPage({
  searchParams,
}: {
  searchParams?: { category?: string };
}) {
  const selected = searchParams?.category;
  const category = selected ? getCategory(selected) : undefined;

  if (category) {
    const list = providersByCategory(category.key);
    return (
      <div>
        <PageHeader
          title={category.label}
          description={category.description}
          breadcrumbs={[
            { label: "決済プロバイダ", href: "/providers" },
            { label: "新規接続", href: "/providers/new" },
            { label: category.label },
          ]}
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((p) => (
            <Link
              key={p.key}
              href={`/providers/new/${p.key}`}
              className="card group flex flex-col gap-3 p-5 transition hover:border-brand-300 hover:shadow"
            >
              <div className="flex items-center gap-3">
                <span
                  className="grid h-10 w-10 place-items-center rounded-lg text-sm font-semibold text-white shadow-sm"
                  style={{ background: p.logoColor }}
                  aria-hidden
                >
                  {p.name.slice(0, 1)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {p.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {p.supportsTestMode ? "テストモード対応" : "本番のみ"}
                  </p>
                </div>
              </div>
              <p className="text-xs text-slate-600">{p.description}</p>
              <span className="mt-auto text-xs font-medium text-brand-700 group-hover:underline">
                接続を設定する →
              </span>
            </Link>
          ))}
        </div>
        <div className="mt-8">
          <Link href="/providers/new" className="text-xs text-slate-500 hover:text-slate-700">
            ← カテゴリ選択に戻る
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="決済プロバイダを接続"
        description="まず接続する決済の種類を選んでください。次の画面で具体的なサービスを選択し、API情報を入力します。"
        breadcrumbs={[
          { label: "決済プロバイダ", href: "/providers" },
          { label: "新規接続" },
        ]}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CATEGORIES.map((c) => {
          const providerCount = PROVIDERS.filter((p) => p.category === c.key).length;
          return (
            <Link
              key={c.key}
              href={`/providers/new?category=${c.key}`}
              className="card group flex flex-col gap-3 p-5 transition hover:border-brand-300 hover:shadow"
            >
              <div className="flex items-center gap-3">
                <CategoryIcon name={c.icon} />
                <div>
                  <p className="text-sm font-semibold text-slate-900">{c.label}</p>
                  <p className="text-xs text-slate-500">
                    対応: {providerCount} サービス
                  </p>
                </div>
              </div>
              <p className="text-xs text-slate-600">{c.description}</p>
              <span className="mt-auto text-xs font-medium text-brand-700 group-hover:underline">
                このカテゴリから選ぶ →
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function CategoryIcon({ name }: { name: string }) {
  const base =
    "grid h-10 w-10 place-items-center rounded-lg bg-brand-50 text-brand-700";
  const props = {
    className: "h-5 w-5",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "credit":
      return (
        <span className={base}>
          <svg viewBox="0 0 24 24" {...props}>
            <rect x="2.5" y="6" width="19" height="13" rx="2.5" />
            <path d="M2.5 10h19M6 15h4" />
          </svg>
        </span>
      );
    case "qr":
      return (
        <span className={base}>
          <svg viewBox="0 0 24 24" {...props}>
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <path d="M14 14h3v3h-3zM20 14v3M14 20h7" />
          </svg>
        </span>
      );
    case "store":
      return (
        <span className={base}>
          <svg viewBox="0 0 24 24" {...props}>
            <path d="M3 8l1.5-4h15L21 8M3 8v11h18V8M3 8h18M9 12h6" />
          </svg>
        </span>
      );
    case "bank":
      return (
        <span className={base}>
          <svg viewBox="0 0 24 24" {...props}>
            <path d="M3 9l9-5 9 5M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18" />
          </svg>
        </span>
      );
    default:
      return (
        <span className={base}>
          <svg viewBox="0 0 24 24" {...props}>
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />
          </svg>
        </span>
      );
  }
}
