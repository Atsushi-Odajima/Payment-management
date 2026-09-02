"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useT } from "@/components/language-provider";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div role="alert" className="card mx-auto max-w-md p-8 text-center">
      <h1 className="text-xl font-semibold text-slate-900">{t("pages.errorTitle")}</h1>
      <p className="mt-2 text-sm text-slate-600">{t("pages.errorBody")}</p>
      {error.digest && <p className="mt-2 font-mono text-xs text-slate-400">{error.digest}</p>}
      <div className="mt-6 flex justify-center gap-2">
        <button type="button" className="btn-primary" onClick={reset}>
          {t("pages.retry")}
        </button>
        <Link href="/" className="btn-secondary">
          {t("pages.backHome")}
        </Link>
      </div>
    </div>
  );
}
