"use client";

// Holds the current UI language.
//
// Resolution order: `wirepay.lang` cookie (read server-side in app/layout.tsx
// and passed as initialLang, so SSR already renders the right language) →
// localStorage → navigator.language. Switching writes both the cookie and
// localStorage and updates <html lang>.

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
  LANG_COOKIE,
  LANG_HEADER,
  LANG_STORAGE_KEY,
  isLang,
  translate,
  formatDateTime,
  type Lang,
  type MessageKey,
  type MessageParams,
} from "@/lib/i18n";
import type { ApiResult } from "@/lib/api/envelope";

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: DEFAULT_LANG,
  setLang: () => {},
});

function persist(lang: Lang) {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // best-effort persistence only
  }
  document.cookie = `${LANG_COOKIE}=${lang}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function LanguageProvider({
  children,
  initialLang,
}: {
  children: React.ReactNode;
  /** Language resolved on the server from the cookie / Accept-Language. */
  initialLang?: Lang;
}) {
  const [lang, setLangState] = useState<Lang>(initialLang ?? DEFAULT_LANG);

  // Fallback for first visits without a cookie: honor an older localStorage
  // choice, else the browser language. Also re-establish the cookie so the
  // next SSR renders the right language immediately.
  useEffect(() => {
    if (initialLang) {
      persist(initialLang);
      return;
    }
    let resolved: Lang | null = null;
    try {
      const stored = localStorage.getItem(LANG_STORAGE_KEY);
      if (isLang(stored)) resolved = stored;
    } catch {
      // ignore
    }
    if (!resolved) {
      resolved = navigator.language?.toLowerCase().startsWith("ja") ? "ja" : "en";
    }
    setLangState(resolved);
    persist(resolved);
  }, [initialLang]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    persist(next);
  }, []);

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
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
  return useCallback((date: Date | string) => formatDateTime(date, lang), [lang]);
}

/**
 * fetch() wrapper for our own API: sends the current language (x-lang) so
 * errors come back localized, and X-Requested-With as a CSRF signal that the
 * middleware requires on every mutation.
 */
export function useApiFetch() {
  const { lang } = useLang();
  return useCallback(
    (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      headers.set(LANG_HEADER, lang);
      headers.set("x-requested-with", "fetch");
      return fetch(input, { ...init, headers });
    },
    [lang],
  );
}

/**
 * Typed JSON call against our API. Never throws for HTTP or JSON failures —
 * both are folded into the ApiResult failure branch so UI code has one path.
 */
export function useApiJson() {
  const apiFetch = useApiFetch();
  const t = useT();
  return useCallback(
    async <T,>(input: RequestInfo | URL, init?: RequestInit): Promise<ApiResult<T>> => {
      try {
        const res = await apiFetch(input, init);
        const body = (await res.json().catch(() => null)) as ApiResult<T> | null;
        if (body && typeof body === "object" && "ok" in body) return body;
        return {
          ok: false,
          error: {
            code: `http_${res.status}`,
            message: res.status === 401 ? t("errors.unauthorized") : t("common.genericError"),
          },
        };
      } catch {
        return { ok: false, error: { code: "network", message: t("errors.network") } };
      }
    },
    [apiFetch, t],
  );
}
