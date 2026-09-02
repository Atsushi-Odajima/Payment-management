"use client";

import { cn } from "@/lib/utils";
import { useLang, useT } from "./language-provider";

export function LanguageToggle() {
  const { lang, setLang } = useLang();
  const t = useT();
  return (
    <div
      role="group"
      aria-label={t("nav.language")}
      className="flex overflow-hidden rounded-lg border border-slate-300 bg-white text-xs font-medium"
    >
      <button
        type="button"
        onClick={() => setLang("en")}
        aria-pressed={lang === "en"}
        className={cn(
          "px-3 py-1.5 transition",
          lang === "en" ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100",
        )}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLang("ja")}
        aria-pressed={lang === "ja"}
        className={cn(
          "px-3 py-1.5 transition",
          lang === "ja" ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100",
        )}
      >
        日本語
      </button>
    </div>
  );
}
