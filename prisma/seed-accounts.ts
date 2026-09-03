// Demo operator accounts created by the seed. This project is a personal
// demo (not operated for real customers), so the credentials are fixed here
// and shown on the login page when DEMO_LOGIN_HINT is set.

export const DEMO_ADMIN_ACCOUNTS = {
  master: {
    id: "adm_demo_master",
    loginId: "kuromaru",
    name: "kuromaru",
    email: "kuromaru@wirepay.demo",
    role: "master" as const,
    password: "atusi0130",
  },
  general: {
    id: "adm_demo_general",
    loginId: "general",
    name: "General Operator",
    email: "general@wirepay.demo",
    role: "general" as const,
    password: process.env.DEMO_GENERAL_PASSWORD || "general1234",
  },
} as const;
