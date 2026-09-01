// Lightweight i18n core shared by client and server code.
// No external dependencies — just two typed message catalogs and a dot-path
// lookup with {placeholder} interpolation.

import { ja } from "./messages/ja";
import { en } from "./messages/en";

export type Lang = "ja" | "en";

export const DEFAULT_LANG: Lang = "ja";
export const LANG_STORAGE_KEY = "wirepay.lang";
export const LANG_HEADER = "x-lang";

const CATALOGS: Record<Lang, typeof ja> = { ja, en: en as typeof ja };

// All dot-separated leaf paths of the ja catalog, e.g. "nav.dashboard".
type Leaves<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${Leaves<T[K]>}`;
}[keyof T & string];

export type MessageKey = Leaves<typeof ja>;

export type MessageParams = Record<string, string | number>;

export function translate(
  lang: Lang,
  key: MessageKey,
  params?: MessageParams,
): string {
  let node: unknown = CATALOGS[lang];
  for (const part of key.split(".")) {
    if (node && typeof node === "object" && part in node) {
      node = (node as Record<string, unknown>)[part];
    } else {
      node = undefined;
      break;
    }
  }
  let text = typeof node === "string" ? node : key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}

export function isLang(value: unknown): value is Lang {
  return value === "ja" || value === "en";
}

/** Resolve the language for an API request from the x-lang header. */
export function langFromRequest(req: Request): Lang {
  const value = req.headers.get(LANG_HEADER);
  return isLang(value) ? value : DEFAULT_LANG;
}

// ─── Localized data text (used by lib/providers/registry.ts) ───
// Data-embedded copy (provider names, field labels, …) lives next to the data
// as {ja, en} pairs; the type makes both languages mandatory.

export interface LocalizedText {
  ja: string;
  en: string;
}

export function pickText(text: LocalizedText, lang: Lang): string {
  return text[lang];
}

// ─── Locale-aware formatting ───
// Currency stays JPY in both languages per product decision; only the date
// format switches (ja: 2026/09/01 12:34, en: Sep 1, 2026, 12:34 PM).

export function formatDateTime(date: Date | string, lang: Lang): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (lang === "en") {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(d);
  }
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
