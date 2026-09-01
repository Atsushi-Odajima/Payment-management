"use client";

// Holds the current UI language. Persisted to localStorage; the first visit
// defaults to Japanese when navigator.language is ja, English otherwise.
// SSR always renders Japanese and the stored language is applied right after
// mount (standard pattern to avoid hydration mismatches).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  DEFAULT_LANG,
  LANG_STORAGE_KEY,
  isLang,
  translate,
  formatDateTime,
  type Lang,
  type MessageKey,
  type MessageParams,
} from "@/lib/i18n";

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: DEFAULT_LANG,
  setLang: () => {},
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);

  useEffect(() => {
    let initial: Lang | null = null;
    try {
      const stored = localStorage.getItem(LANG_STORAGE_KEY);
      if (isLang(stored)) initial = stored;
    } catch {
      // localStorage unavailable (private mode etc.) — fall through
    }
    if (!initial) {
      initial = navigator.language?.toLowerCase().startsWith("ja")
        ? "ja"
        : "en";
    }
    setLangState(initial);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      // best-effort persistence only
    }
  }, []);

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang(): LanguageContextValue {
  return useContext(LanguageContext);
}

/** Translation hook: const t = useT(); t("nav.dashboard") */
export function useT() {
  const { lang } = useLang();
  return useCallback(
    (key: MessageKey, params?: MessageParams) => translate(lang, key, params),
    [lang],
  );
}

/** Locale-aware date-time formatter bound to the current language. */
export function useFormatDateTime() {
  const { lang } = useLang();
  return useCallback(
    (date: Date | string) => formatDateTime(date, lang),
    [lang],
  );
}
