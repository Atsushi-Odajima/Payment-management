// Demo operator accounts created by the seed, one per role (Phase I-1). This
// project is a personal demo (not operated for real customers), so the
// credentials are fixed here and shown on the login page when
// DEMO_LOGIN_HINT is set. The ids of the first two are kept from the
// two-role era (kuromaru was "master", general was "general").

export const DEMO_ADMIN_ACCOUNTS = {
  admin: {
    id: "adm_demo_master",
    loginId: "kuromaru",
    name: "kuromaru",
    email: "kuromaru@wirepay.demo",
    role: "admin" as const,
    password: "atusi0130",
  },
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
    password: "accounting1234",
  },
  developer: {
    id: "adm_demo_developer",
    loginId: "developer",
    name: "Developer Operator",
    email: "developer@wirepay.demo",
    role: "developer" as const,
    password: "developer1234",
  },
  viewer: {
    id: "adm_demo_viewer",
    loginId: "viewer",
    name: "Viewer",
    email: "viewer@wirepay.demo",
    role: "viewer" as const,
    password: "viewer1234",
  },
} as const;
