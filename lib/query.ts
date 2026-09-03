// Query-string helpers shared by list screens (client-safe, no Node APIs).

export type QueryParams = Record<string, string | undefined>;

/** Build `basePath?…` from the current params merged with `next` (undefined removes a key). */
export function buildHref(basePath: string, params: QueryParams, next: QueryParams = {}): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...next })) if (v) q.set(k, v);
  const qs = q.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export type SortDir = "asc" | "desc";

export interface SortState {
  key: string;
  dir: SortDir;
}

/** Parse `sort=key&dir=asc` against an allow-list, falling back to the default. */
export function parseSort(q: QueryParams | undefined, allowed: readonly string[], fallback: SortState): SortState {
  const key = q?.sort && allowed.includes(q.sort) ? q.sort : fallback.key;
  const dir: SortDir = q?.dir === "asc" || q?.dir === "desc" ? q.dir : key === fallback.key ? fallback.dir : "asc";
  return { key, dir };
}
