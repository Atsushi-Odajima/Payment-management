// Tiny client-side flash store for one-shot success notices.
//
// After a mutation we call router.refresh(); on dynamic routes with a
// loading boundary the page tree can be remounted, which would drop plain
// useState notices. Stashing the message here (module scope survives the
// remount within the same document) lets the component pick it up on mount.

const flashes = new Map<string, string>();

export function pushFlash(key: string, message: string): void {
  flashes.set(key, message);
}

/** Returns and clears the flash for `key` (undefined when none). */
export function popFlash(key: string): string | undefined {
  const v = flashes.get(key);
  if (v !== undefined) flashes.delete(key);
  return v;
}
