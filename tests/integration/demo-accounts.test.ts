// Public-demo account exposure: only the two accounts listed on the login
// page (operations demo `general`, merchant demo MER-00001) keep a known
// password in production; the admin's comes from DEMO_ADMIN_PASSWORD and
// every other seeded account gets a random one.

import { afterEach, describe, expect, it, vi } from "vitest";

async function loadAccounts(env: { NODE_ENV: string; DEMO_ADMIN_PASSWORD?: string }) {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", env.NODE_ENV);
  if (env.DEMO_ADMIN_PASSWORD === undefined) vi.stubEnv("DEMO_ADMIN_PASSWORD", "");
  else vi.stubEnv("DEMO_ADMIN_PASSWORD", env.DEMO_ADMIN_PASSWORD);
  return import("@/prisma/seed-accounts");
}

describe("demo account passwords", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("keeps the fixed development passwords outside production", async () => {
    const m = await loadAccounts({ NODE_ENV: "test" });
    expect(m.DEMO_ADMIN_ACCOUNTS.admin.password).toBe("atusi0130");
    expect(m.DEMO_ADMIN_ACCOUNTS.accounting.password).toBe("accounting1234");
    expect(m.DEMO_PUBLIC_OPERATOR.loginId).toBe("general");
    expect(m.DEMO_PUBLIC_OPERATOR.password).toBe("general1234");
    expect(m.hiddenDemoPassword("x")).toBe("x");
  });

  it("hides every non-listed account in production and takes the admin password from DEMO_ADMIN_PASSWORD", async () => {
    const hidden = await loadAccounts({ NODE_ENV: "production" });
    expect(hidden.DEMO_ADMIN_PASSWORD_CONFIGURED).toBe(false);
    expect(hidden.DEMO_ADMIN_ACCOUNTS.admin.password).not.toBe("atusi0130");
    expect(hidden.DEMO_ADMIN_ACCOUNTS.admin.password.length).toBeGreaterThanOrEqual(24);
    for (const role of ["accounting", "developer", "viewer"] as const) {
      expect(hidden.DEMO_ADMIN_ACCOUNTS[role].password).not.toBe(`${role}1234`);
    }
    // The listed operations account stays usable.
    expect(hidden.DEMO_ADMIN_ACCOUNTS.cs.password).toBe("general1234");
    // Two seeds never share a hidden password.
    expect(hidden.hiddenDemoPassword("a")).not.toBe(hidden.hiddenDemoPassword("a"));

    const configured = await loadAccounts({ NODE_ENV: "production", DEMO_ADMIN_PASSWORD: "owner-only-secret" });
    expect(configured.DEMO_ADMIN_PASSWORD_CONFIGURED).toBe(true);
    expect(configured.DEMO_ADMIN_ACCOUNTS.admin.password).toBe("owner-only-secret");
  });
});
