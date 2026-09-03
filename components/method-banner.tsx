"use client";

// Red header banner while any payment method is suspended globally (Phase I-3).

import Link from "next/link";
import { useLang, useT } from "@/components/language-provider";
import { CATEGORIES } from "@/lib/providers/registry";
import { pickText } from "@/lib/i18n";

export function MethodBanner({ methods }: { methods: string[] }) {
  const t = useT();
  const { lang } = useLang();
  if (methods.length === 0) return null;
  const labels = methods.map((m) => {
    const c = CATEGORIES.find((x) => x.key === m);
    return c ? pickText(c.label, lang) : m;
  });
  return (
    <div role="region" aria-label={t("methodControls.bannerLabel")} className="border-b border-rose-200 bg-rose-600 px-4 py-2 text-sm text-white">
      <span className="mr-2 rounded bg-white/20 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide">{t("methodControls.bannerTag")}</span>
      <span>{t("methodControls.bannerText", { methods: labels.join(" / ") })}</span>
      <Link href="/payment-method-controls" className="ml-3 underline decoration-white/60 hover:decoration-white">
        {t("methodControls.bannerLink")}
      </Link>
    </div>
  );
}
