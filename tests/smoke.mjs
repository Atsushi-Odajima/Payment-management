// Manual end-to-end smoke run against a running server (not part of `npm test`).
//   ADMIN_PASSWORD=demo1234 npx next start -p 3010 &
//   BASE=http://localhost:3010 PASSWORD=demo1234 node tests/smoke.mjs
// Also writes the README screenshots into docs/screenshots/.

import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3010";
const PASSWORD = process.env.PASSWORD ?? "demo1234";
const OUT = "docs/screenshots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_BIN || undefined,
  args: ["--no-sandbox"],
});
const results = [];
const check = (name, ok, extra = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "✓" : "✗"} ${name}${extra ? " — " + extra : ""}`);
};

// ── Desktop, Japanese: screenshot only
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ja-JP" });
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT}/dashboard-ja.png` });
  check("dashboard renders in Japanese", (await page.locator("h1").textContent()) === "ダッシュボード");
  await ctx.close();
}

// ── Desktop, English: full flow
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-US" });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("console", (m) => {
    // Intentional 4xx/5xx responses in this flow log "Failed to load resource"; only real errors count.
    // "Failed to fetch RSC payload" is Next's prefetch being aborted by the test's own page.goto().
    if (m.type() === "error" && !/favicon|Failed to load resource|Failed to fetch RSC payload/.test(m.text())) {
      pageErrors.push(m.text());
    }
  });

  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  check("dashboard renders in English (Accept-Language)", (await page.locator("h1").textContent()) === "Dashboard");
  await page.screenshot({ path: `${OUT}/dashboard-en.png` });

  // Unauthenticated mutation is refused with a localized message
  await page.goto(BASE + "/payments/pay_demo_003", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Master" }).click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Mark completed" }).click();
  await page.locator("dialog[open]").getByRole("button", { name: "Mark completed" }).click();
  await page.waitForSelector("[role=alert]:not(#__next-route-announcer__)");
  check("unauthenticated complete → 'Login required'", (await page.locator("[role=alert]:not(#__next-route-announcer__)").textContent())?.includes("Login required"));

  // Login
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  check("login page shows demo hint", (await page.textContent("body"))?.includes("Demo password"));
  await page.fill("#password", "wrong");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForSelector("[role=alert]:not(#__next-route-announcer__)");
  check("wrong password → error", (await page.locator("[role=alert]:not(#__next-route-announcer__)").textContent())?.includes("Incorrect password"));
  await page.fill("#password", PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(BASE + "/");
  check("login redirects to dashboard and shows Log out", await page.getByRole("button", { name: "Log out" }).isVisible());

  // Provider config screenshot (Stripe form, EN)
  await page.goto(BASE + "/providers/new/stripe", { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT}/provider-config-en.png` });

  // Create a transaction (authorize only) → it lands in the applications list →
  // complete (master) → partial refund → full refund
  await page.goto(BASE + "/payments/new", { waitUntil: "networkidle" });
  // The newest provider (bank transfer) is preselected; pick the Stripe one for the card flow.
  const stripeValue = await page.locator("#providerId option", { hasText: "Stripe" }).first().getAttribute("value");
  await page.selectOption("#providerId", stripeValue);
  await page.fill("#amount", "6000");
  await page.getByRole("checkbox").uncheck();
  await page.getByRole("button", { name: "Create Payment" }).click();
  await page.waitForURL(/\/applications\/[a-z0-9]+$/);
  await page.getByText("Authorized").first().waitFor({ timeout: 15000 });
  check("created transaction is Authorized (applications detail)", (await page.locator(".badge").allTextContents()).includes("Authorized"));

  await page.getByRole("button", { name: "General" }).click();
  await page.waitForTimeout(400);
  check("general role cannot complete", await page.getByRole("button", { name: "Mark completed" }).isDisabled());
  await page.getByRole("button", { name: "Master" }).click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Mark completed" }).click();
  await page.locator("dialog[open]").getByRole("button", { name: "Mark completed" }).click();
  await page.getByText("Transaction completed.").waitFor({ timeout: 15000 });
  await page.waitForTimeout(400);
  check("complete succeeds (master)", (await page.locator(".badge").allTextContents()).includes("Completed"));

  await page.getByRole("button", { name: "Refund" }).click();
  await page.waitForSelector("dialog[open]");
  await page.fill("#refund-amount", "7000");
  check("refund > remaining disables confirm", await page.locator("dialog[open] button[type=submit]").isDisabled());
  await page.fill("#refund-amount", "1500");
  await page.fill("#refund-reason", "size exchange");
  await page.locator("dialog[open] button[type=submit]").click();
  await page.waitForTimeout(800);
  const body1 = await page.textContent("body");
  check("partial refund → Partially refunded + refunds list", body1.includes("Partially refunded") && body1.includes("size exchange"));

  await page.getByRole("button", { name: "Refund" }).click();
  await page.waitForSelector("dialog[open]");
  check("second refund defaults to remaining 4500", (await page.inputValue("#refund-amount")) === "4500");
  await page.locator("dialog[open] button[type=submit]").click();
  await page.waitForTimeout(800);
  const body2 = await page.textContent("body");
  check("full refund → Refunded, no actions left", body2.includes("No actions are available"));
  check("event timeline lists created/capture/refund", body2.includes("Status history") && (body2.match(/Refunded/g) || []).length >= 2);

  // Webhook simulator on the seeded authorized Stripe payment
  await page.goto(BASE + "/payments/pay_demo_003", { waitUntil: "networkidle" });
  await page.selectOption("#webhook-type", "payment.captured");
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByText("Webhook received and processed").waitFor({ timeout: 20000 });
  await page.waitForTimeout(600);
  const body3 = await page.textContent("body");
  check("webhook simulate → completed via webhook", (await page.locator(".badge").allTextContents()).includes("Completed") && body3.includes("Webhook"));
  await page.screenshot({ path: `${OUT}/payment-detail-en.png`, fullPage: false });

  // Duplicate protection is exercised by the second identical event id server-side;
  // here just re-send another type and make sure a refused transition is shown, not a crash.
  await page.selectOption("#webhook-type", "payment.cancelled");
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByText("cannot be voided").waitFor({ timeout: 20000 });
  check("illegal webhook transition surfaces an error (no crash)", true);

  // Language toggle persists via cookie: switch to JA, reload → SSR Japanese
  await page.getByRole("button", { name: "日本語" }).click();
  await page.reload({ waitUntil: "networkidle" });
  check("toggle → 日本語 persists across reload", (await page.locator("h1").textContent())?.startsWith("取引"));
  check("no page errors during flow", pageErrors.length === 0, pageErrors.join(" | ").slice(0, 300));
  await ctx.close();
}

// ── Mobile: bottom tab bar + scrollable table
{
  const iphone = devices["iPhone 14 Pro"];
  const ctx = await browser.newContext({ ...iphone, locale: "ja-JP" });
  const page = await ctx.newPage();
  await page.goto(BASE + "/payments", { waitUntil: "networkidle" });
  const nav = page.locator("nav.fixed");
  check("mobile bottom tab bar visible", await nav.isVisible());
  const m = await page.evaluate(() => {
    const wrap = document.querySelector(".overflow-x-auto");
    return { docScroll: document.documentElement.scrollWidth, vw: window.innerWidth, canScroll: wrap ? wrap.scrollWidth > wrap.clientWidth : false };
  });
  check("table scrolls inside its container, page does not", m.docScroll === m.vw && m.canScroll, JSON.stringify(m));
  await page.screenshot({ path: `${OUT}/mobile-payments.png` });
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
