"use client";

// Test / live data mode (B-5). The choice lives in a cookie so Server
// Components filter by it; the header toggle updates the cookie and
// refreshes the server-rendered tree — the same pattern as the language.

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useT } from "./language-provider";
import { useToast } from "./toast";
import { MODE_COOKIE, type DataMode } from "@/lib/mode";
import { cn } from "@/lib/utils";

interface ModeContextValue {
  mode: DataMode;
  setMode: (mode: DataMode) => void;
}

const ModeContext = createContext<ModeContextValue>({ mode: "test", setMode: () => {} });

export function ModeProvider({ children, initialMode }: { children: React.ReactNode; initialMode: DataMode }) {
  const router = useRouter();
  const [mode, setModeState] = useState<DataMode>(initialMode);
  const setMode = useCallback(
    (next: DataMode) => {
      setModeState(next);
      document.cookie = `${MODE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
      router.refresh();
    },
    [router],
  );
  const value = useMemo(() => ({ mode, setMode }), [mode, setMode]);
  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>;
}

export function useMode(): ModeContextValue {
  return useContext(ModeContext);
}

/** Header control: Stripe-style test / live switch. */
export function ModeToggle() {
  const { mode, setMode } = useMode();
  const t = useT();
  const toast = useToast();
  const switchTo = (next: DataMode) => {
    if (mode === next) return;
    setMode(next);
    // Phase P3-1: make the jump into live data unmistakable.
    if (next === "live") toast.show(t("mode.liveToast"), "info");
  };
  return (
    <div role="group" aria-label={t("mode.label")} className="flex overflow-hidden rounded-lg border border-slate-300 bg-white text-xs font-medium">
      <button
        type="button"
        onClick={() => switchTo("test")}
        aria-pressed={mode === "test"}
        title={t("mode.testHint")}
        className={cn("px-3 py-1.5 transition", mode === "test" ? "bg-amber-500 text-white" : "text-slate-600 hover:bg-slate-100")}
      >
        {t("mode.test")}
      </button>
      <button
        type="button"
        onClick={() => switchTo("live")}
        aria-pressed={mode === "live"}
        title={t("mode.liveHint")}
        className={cn("px-3 py-1.5 transition", mode === "live" ? "bg-emerald-600 text-white" : "text-slate-600 hover:bg-slate-100")}
      >
        {t("mode.live")}
      </button>
    </div>
  );
}
