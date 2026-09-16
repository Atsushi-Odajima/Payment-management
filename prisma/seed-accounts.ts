// Demo operator accounts created by the seed, one per role (Phase I-1). This
// project is a personal demo (not operated for real customers). The ids of
// the first two are kept from the two-role era (kuromaru was "master",
// general was "general").
//
// Public demo (NODE_ENV=production): the login page lists only the
// operations demo account (`general`, role cs) and the merchant demo account
// (MER-00001), and those are the only seeded accounts a visitor can use.
//   - the admin's password comes from DEMO_ADMIN_PASSWORD (the owner sets it);
//     when the variable is unset the account gets an unguessable random
//     password on every seed, so nobody can log in as admin
//   - accounting / developer / viewer get a random password on every seed
//     (they exist for the permission tests and the role demo, not for visitors)
// Outside production (development, `npm test`, `npm run db:reset` for the
// smoke runs) the fixed passwords below are used.

import { randomBytes } from "node:crypto";

const production = process.env.NODE_ENV === "production";

/** A password nobody knows in production; the fixed development password elsewhere. */
export function hiddenDemoPassword(dev: string): string {
  return production ? randomBytes(24).toString("base64url") : dev;
}

/** True when the operator can log in as admin on the public demo (DEMO_ADMIN_PASSWORD set). */
export const DEMO_ADMIN_PASSWORD_CONFIGURED = Boolean(process.env.DEMO_ADMIN_PASSWORD);

export const DEMO_ADMIN_ACCOUNTS = {
  admin: {
    id: "adm_demo_master",
    loginId: "kuromaru",
    name: "kuromaru",
    email: "kuromaru@wirepay.demo",
    role: "admin" as const,
    password: process.env.DEMO_ADMIN_PASSWORD || hiddenDemoPassword("atusi0130"),
  },
  // The operations demo account shown on the public login page (運営デモアカウント).
  cs: {
    id: "adm_demo_general",
    loginId: "general",
    name: "Support Operator",
    email: "general@wirepay.demo",
    role: "cs" as const,
    password: process.env.DEMO_GENERAL_PASSWORD || "general1234",
  },
  accounting: {
    id: "adm_demo_accounting",
    loginId: "accounting",
    name: "Accounting Operator",
    email: "accounting@wirepay.demo",
    role: "accounting" as const,
    password: hiddenDemoPassword("accounting1234"),
  },
  developer: {
    id: "adm_demo_developer",
    loginId: "developer",
    name: "Developer Operator",
    email: "developer@wirepay.demo",
    role: "developer" as const,
    password: hiddenDemoPassword("developer1234"),
  },
  viewer: {
    id: "adm_demo_viewer",
    loginId: "viewer",
    name: "Viewer",
    email: "viewer@wirepay.demo",
    role: "viewer" as const,
    password: hiddenDemoPassword("viewer1234"),
  },
} as const;

/** The only operator account listed on the login page (and usable by visitors on the public demo). */
export const DEMO_PUBLIC_OPERATOR = DEMO_ADMIN_ACCOUNTS.cs;
