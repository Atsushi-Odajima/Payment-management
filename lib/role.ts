// Operator roles and the permission matrix — the single source of truth
// (Phase I-1). Everything else derives from here:
//   - API routes:  requirePermission(req, resource, action)  (lib/api/role-guard.ts)
//   - pages:       requirePermissionPage(resource, action)   (lib/admin/page-guard.ts)
//   - client UI:   useCan(resource, action)                  (components/session-provider.tsx)
//   - docs:        scripts/gen-permissions.ts regenerates the tables in
//                  CLAUDE.md and content/manual/{ja,en}/intro.md
// Client-safe: no prisma, no node-only imports.

export const ROLES = ["admin", "accounting", "cs", "developer", "viewer"] as const;
export type Role = (typeof ROLES)[number];

/** Pre-Phase-I role names still found in old rows / cookies. */
export const LEGACY_ROLE_MAP: Record<string, Role> = { master: "admin", general: "cs" };

export const isRole = (v: unknown): v is Role => typeof v === "string" && (ROLES as readonly string[]).includes(v);

/** Accepts current and legacy names; anything unknown is treated as the least-privileged role. */
export function normalizeRole(v: unknown): Role {
  if (isRole(v)) return v;
  if (typeof v === "string" && v in LEGACY_ROLE_MAP) return LEGACY_ROLE_MAP[v];
  return "viewer";
}

/** Role of anonymous visitors (reads are public, writes need a session). */
export const DEFAULT_ROLE: Role = "viewer";

const ALL: readonly Role[] = ROLES;
const STAFF: readonly Role[] = ["admin", "accounting", "cs", "developer"];
const ADMIN: readonly Role[] = ["admin"];
const ADMIN_ACCOUNTING: readonly Role[] = ["admin", "accounting"];
const ADMIN_CS: readonly Role[] = ["admin", "cs"];
const ADMIN_DEV: readonly Role[] = ["admin", "developer"];
const ADMIN_ACCOUNTING_CS: readonly Role[] = ["admin", "accounting", "cs"];

/**
 * resource → action → roles allowed. "view" is listed explicitly so the
 * generated tables are complete. Keep the keys stable: they are also the
 * i18n keys `permissions.resource.<resource>` / `permissions.action.<action>`.
 */
export const PERMISSIONS = {
  merchant: { view: ALL, create: ADMIN_CS, update: ADMIN_CS, reveal_password: ADMIN, regenerate_password: ADMIN },
  merchant_contract: { view: ALL, update: ADMIN_ACCOUNTING },
  api_key: { view: ALL, issue: ADMIN_DEV, rotate: ADMIN_DEV, revoke: ADMIN_DEV },
  agent: { view: ALL, create: ADMIN_CS, update: ADMIN_CS },
  payment: { view: ALL, create: ADMIN_CS, state: ADMIN, deposit: ADMIN_ACCOUNTING, renotify: ["admin", "cs", "developer"], simulate_webhook: ADMIN_DEV },
  payment_note: { view: ALL, create: STAFF, update_own: STAFF, delete: ADMIN, pin: ADMIN_CS },
  unmatched_deposit: { view: ALL, register: ADMIN_ACCOUNTING_CS, match: ADMIN_ACCOUNTING, dismiss: ADMIN_ACCOUNTING_CS },
  deposit_notification: { view: ALL },
  deposit_diff: { view: ALL, update: ADMIN_ACCOUNTING_CS },
  refund: { view: ALL, request: ADMIN_CS, force: ADMIN, decide: ADMIN_ACCOUNTING },
  receipt: { view: ALL, issue: ADMIN_ACCOUNTING_CS },
  settlement: { view: ALL, generate: ADMIN_ACCOUNTING, transition: ADMIN_ACCOUNTING, delete: ADMIN_ACCOUNTING },
  invoice: { export: ADMIN_ACCOUNTING },
  agent_fee: { view: ALL },
  report: { view: ALL },
  webhook: { view: ALL, resend: ADMIN_DEV },
  chargeback: { view: ALL, create: ADMIN_ACCOUNTING, update: ADMIN_ACCOUNTING },
  blacklist: { view: ALL, create: ADMIN_CS, update: ADMIN_CS },
  risk_setting: { view: ALL, update: ADMIN_CS },
  email_template: { view: ALL, update: ADMIN_DEV },
  email_log: { view: ALL },
  announcement: { view: ALL, create: ADMIN_CS, update: ADMIN_CS, publish: ADMIN_CS },
  plan: { view: ALL, create: ADMIN_CS, update: ADMIN_CS },
  subscription: { view: ALL, create: ADMIN_CS, action: ADMIN_CS },
  demo_setting: { view: ALL, update: ADMIN_DEV },
  payment_link: { view: ALL, create: ADMIN_CS, disable: ADMIN_CS },
  ip_restriction: { view: ALL, create: ADMIN_DEV, update: ADMIN_DEV, delete: ADMIN_DEV },
  provider: { view: ALL, create: ADMIN_DEV, update: ADMIN_DEV, delete: ADMIN_DEV, test: ADMIN_DEV },
  payment_method_control: { view: ALL, suspend_global: ADMIN, suspend_merchant: ADMIN_CS },
  admin_user: { view: ADMIN, create: ADMIN, update: ADMIN, reset: ADMIN },
  account: { update: ALL },
  audit_log: { view: ALL },
  search_admin: { view: ADMIN },
  global_setting: { view: ADMIN, update: ADMIN },
  customer: { view: ALL, anonymize: ADMIN },
  csv: { export: STAFF },
  pii: { unmask: ADMIN_CS },
  api_docs: { view: ALL },
} as const satisfies Record<string, Record<string, readonly Role[]>>;

export type Resource = keyof typeof PERMISSIONS;
export type ActionOf<R extends Resource> = keyof (typeof PERMISSIONS)[R] & string;
export type Permission = { [R in Resource]: [R, ActionOf<R>] }[Resource];

export const RESOURCES = Object.keys(PERMISSIONS) as Resource[];

export function can<R extends Resource>(role: Role | null | undefined, resource: R, action: ActionOf<R>): boolean {
  const roles = (PERMISSIONS[resource] as Record<string, readonly Role[]>)[action];
  return !!roles && !!role && roles.includes(role);
}

/** Every (resource, action) the role may perform — for the admin detail screen and the docs generator. */
export function describeRole(role: Role): Array<{ resource: Resource; actions: string[] }> {
  return RESOURCES.map((resource) => ({
    resource,
    actions: Object.entries(PERMISSIONS[resource] as Record<string, readonly Role[]>)
      .filter(([, roles]) => roles.includes(role))
      .map(([action]) => action),
  })).filter((r) => r.actions.length > 0);
}

/** Roles allowed for an action, for the docs generator. */
export function rolesFor<R extends Resource>(resource: R, action: ActionOf<R>): readonly Role[] {
  return (PERMISSIONS[resource] as Record<string, readonly Role[]>)[action] ?? [];
}
