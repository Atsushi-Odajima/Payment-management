"use client";

import Link from "next/link";
import { useT } from "@/components/language-provider";

export default function NotFound() {
  const t = useT();
  return (
    <div className="card mx-auto max-w-md p-8 text-center">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">404</p>
      <h1 className="mt-2 text-xl font-semibold text-slate-900">{t("pages.notFoundTitle")}</h1>
      <p className="mt-2 text-sm text-slate-600">{t("pages.notFoundBody")}</p>
      <Link href="/" className="btn-primary mt-6">
        {t("pages.backHome")}
      </Link>
    </div>
  );
}
