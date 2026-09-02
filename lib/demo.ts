// Demo-environment knobs.

/** Hard caps so a public demo cannot be filled up by a script. */
export const DEMO_LIMITS = {
  providers: 50,
  payments: 1000,
} as const;

/** When set, destructive operations (DELETE, provider PATCH) are refused. */
export function isDemoReadonly(): boolean {
  return process.env.DEMO_READONLY === "1";
}
