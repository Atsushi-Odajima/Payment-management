// Test / live data mode (B-5). The header toggle stores the choice in a
// cookie; Server Components read it here and filter transaction data by
// Payment.livemode. Test data never reaches settlement (Phase D).

export const MODE_COOKIE = "wirepay.mode";
export const DATA_MODES = ["test", "live"] as const;
export type DataMode = (typeof DATA_MODES)[number];
export const DEFAULT_MODE: DataMode = "test";

export function isDataMode(v: unknown): v is DataMode {
  return v === "test" || v === "live";
}

export function resolveMode(cookieValue: string | undefined | null): DataMode {
  return isDataMode(cookieValue) ? cookieValue : DEFAULT_MODE;
}

/** Prisma `where` fragment for the mode. */
export function livemodeWhere(mode: DataMode): { livemode: boolean } {
  return { livemode: mode === "live" };
}

/** Read the mode cookie in a Server Component (`cookies()` from next/headers). */
export function modeFromCookieStore(store: { get(name: string): { value: string } | undefined }): DataMode {
  return resolveMode(store.get(MODE_COOKIE)?.value);
}
