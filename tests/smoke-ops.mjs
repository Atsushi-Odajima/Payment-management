// Manual end-to-end smoke for the operations screens added in phases C+
// (refunds, …). Not part of `npm test`.
//   npm run db:reset && DEMO_LOGIN_HINT=1 npx next start -p 3010 &
//   BASE=http://localhost:3010 node tests/smoke-ops.mjs

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3010";
const OUT = "docs/screenshots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_BIN || undefined, args: ["--no-sandbox"] });
const results = [];
const check = (name, ok, extra = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "✓" : "✗"} ${name}${extra ? " — " + extra : ""}`);
};
const pageErrors = [];

async function login(loginId, password) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, locale: "en-US" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill("#loginId", loginId);
  await page.fill("#password", password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(BASE + "/");
  return { ctx, page };
}

// ── Refunds (Phase C) ──────────────────────────────────────────────────
{
  const { ctx, page } = await login("general", process.env.GENERAL_PASSWORD ?? "general1234");
  await page.goto(BASE + "/refunds", { waitUntil: "networkidle" });
  check("refunds list: seeded pending request first", (await page.locator("tbody tr").first().textContent()).includes("Requested"));
  check("refunds list: pending badge in header", (await page.textContent("body")).includes("1 awaiting review"));

  // General files a request from the transaction detail.
  await page.goto(BASE + "/payments", { waitUntil: "networkidle" });
  await page.getByText("ORD-DEMO-001").first().click();
  await page.waitForURL(/\/payments\/[a-z0-9_]+$/);
  await page.getByRole("button", { name: "Request refund" }).click();
  const dialog = page.locator("dialog[open]");
  await dialog.locator("#refund-amount").fill("1000");
  await dialog.locator("#refund-reason-code").selectOption("defect");
  await dialog.locator("#refund-reason").fill("smoke");
  await dialog.getByRole("button", { name: "Request refund" }).click();
  await page.getByText("Refund requested").waitFor({ timeout: 8000 });
  check("general: refund request filed from the transaction detail", true);
  await page.waitForTimeout(500);
  check("transaction detail lists the pending request", (await page.textContent("body")).includes("Requested"));
  await ctx.close();
}
{
  const { ctx, page } = await login("kuromaru", process.env.PASSWORD ?? "atusi0130");
  await page.goto(BASE + "/refunds", { waitUntil: "networkidle" });
  check("master: two pending requests listed", (await page.textContent("body")).includes("2 awaiting review"));
  await page.screenshot({ path: `${OUT}/refunds-list-en.png` });
  await page.locator("tbody tr").filter({ hasText: "ORD-DEMO-001" }).first().click();
  await page.waitForURL(/\/refunds\/[a-z0-9_]+$/);
  await page.getByRole("button", { name: "Approve" }).click();
  await page.locator("dialog[open] #refund-note").fill("approved in smoke");
  await page.locator("dialog[open]").getByRole("button", { name: "Approve" }).click();
  await page.getByText("Refund approved").waitFor({ timeout: 8000 });
  await page.waitForTimeout(500);
  check("master: approve → completed", (await page.textContent("body")).includes("Completed"));
  await page.screenshot({ path: `${OUT}/refund-detail-en.png` });
  await page.goto(BASE + "/payments", { waitUntil: "networkidle" });
  check("payments list shows partially refunded", (await page.textContent("body")).includes("Partially refunded"));
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  check("dashboard: refunds card shows 1 awaiting review", (await page.textContent("body")).includes("1 awaiting review"));
  await ctx.close();
}

check("no page errors", pageErrors.length === 0, pageErrors.join(" | ").slice(0, 200));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
