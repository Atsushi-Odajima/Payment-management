// Manual end-to-end smoke for the dashboard, agents, applications, IP
// restrictions and manual screens (not part of `npm test`).
//   ADMIN_PASSWORD=demo1234 npx next start -p 3010 &
//   BASE=http://localhost:3010 PASSWORD=demo1234 node tests/smoke-dashboard.mjs

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3010";
const PASSWORD = process.env.PASSWORD ?? "demo1234";
const OUT = "docs/screenshots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_BIN || undefined, args: ["--no-sandbox"] });
const results = [];
const check = (name, ok, extra = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "✓" : "✗"} ${name}${extra ? " — " + extra : ""}`);
};

const ctx = await browser.newContext({
  viewport: { width: 1280, height: 1000 },
  locale: "en-US",
  extraHTTPHeaders: { "x-forwarded-for": "198.51.100.42" },
});
const page = await ctx.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

// Login
await page.goto(BASE + "/login", { waitUntil: "networkidle" });
await page.fill("#password", PASSWORD);
await page.getByRole("button", { name: "Log in" }).click();
await page.waitForURL(BASE + "/");

// Dashboard: six cards, pending badge, sidebar
const cards = page.locator("main ul[aria-label] > li > a");
check("dashboard shows 6 cards", (await cards.count()) === 6, String(await cards.count()));
const cardHrefs = await cards.evaluateAll((els) => els.map((e) => e.getAttribute("href")));
check(
  "cards link to the 6 sections",
  ["/merchants", "/agents", "/payments", "/applications", "/ip-restrictions", "/manual"].every((h) => cardHrefs.includes(h)),
  cardHrefs.join(","),
);
check("overdue badge on applications card", (await page.getByText("1 overdue").count()) === 1);
check("applications card counts open transactions", (await page.getByText("3 open").count()) === 1);
check("no payment table on the top page", (await page.locator("main table").count()) === 0);
check("sidebar has Agents", await page.getByRole("link", { name: "Agents", exact: true }).first().isVisible());
check("sidebar has IP Restrictions", await page.getByRole("link", { name: "IP Restrictions", exact: true }).first().isVisible());
await page.screenshot({ path: `${OUT}/dashboard-en.png` });

// Payments moved to /payments
await page.goto(BASE + "/payments", { waitUntil: "networkidle" });
check("/payments lists payments", (await page.locator("main table tbody tr").count()) >= 3);
check("/payments has a ? link to the manual", (await page.locator("a[href='/manual/payments']").count()) >= 1);

// Agents
await page.goto(BASE + "/agents", { waitUntil: "networkidle" });
const agentRows = page.locator("tbody tr");
check("agents list shows 2 seeded agents", (await agentRows.count()) === 2);
check("agents list shows AGT-00001 first", (await agentRows.first().textContent())?.includes("AGT-00001"));
await agentRows.first().click();
await page.waitForURL(/\/agents\/[a-z0-9_]+$/);
check("agent detail lists linked merchants", (await page.getByText("Linked merchants").count()) === 1 && (await page.locator("main table tbody tr").count()) >= 1);
await page.screenshot({ path: `${OUT}/agent-detail-en.png` });
await page.goto(BASE + "/agents/new", { waitUntil: "networkidle" });
check("agent form: submit disabled until required fields filled", await page.getByRole("button", { name: "Create agent" }).isDisabled());
check("agent form: provisional code AGT-00003", (await page.getByLabel(/^Agent ID/).inputValue()) === "AGT-00003");

// Merchant form has the agent select
await page.goto(BASE + "/merchants/new", { waitUntil: "networkidle" });
const agentSelect = page.getByLabel(/^Referring agent/).first();
check("merchant form has an agent select with 2 agents", (await agentSelect.locator("option").count()) === 3);

// Applications (transactions not completed yet)
await page.goto(BASE + "/applications", { waitUntil: "networkidle" });
const appRows = page.locator("tbody tr");
check("applications list shows the 4 open / failed transactions", (await appRows.count()) === 4);
const firstRow = await appRows.nth(0).textContent();
check("overdue transfer listed first, in red", firstRow.includes("ORD-DEMO-005") && firstRow.includes("Overdue") && (await appRows.nth(0).getAttribute("class")).includes("bg-rose-50"));
check("next awaiting transfer second", (await appRows.nth(1).textContent()).includes("ORD-DEMO-004"));
check("completed transactions are not listed", !(await page.textContent("body")).includes("ORD-DEMO-001"));
await page.screenshot({ path: `${OUT}/applications-en.png` });
// Filter by method
await page.selectOption("select:near(:text('Payment method'))", "bank");
await page.waitForURL(/method=bank/);
await page.waitForTimeout(400);
check("method filter → 2 bank transfers", (await page.locator("tbody tr").count()) === 2);
await page.goto(BASE + "/applications", { waitUntil: "networkidle" });
await page.locator("tbody tr").nth(1).getByRole("link").first().click();
await page.waitForURL(/\/applications\/[a-z0-9_]+$/);
check("detail shows transfer ID and history", (await page.textContent("body")).includes("48213907") && (await page.getByText("Status history").count()) === 1);
check("general role: reconcile disabled", await page.getByRole("button", { name: "Reconcile deposit" }).isDisabled());
await page.getByRole("button", { name: "Master" }).click();
await page.waitForTimeout(600);
check("master role: reconcile enabled", await page.getByRole("button", { name: "Reconcile deposit" }).isEnabled());
// Short deposit → still awaiting with the short flag
await page.getByRole("button", { name: "Reconcile deposit" }).click();
const dialog = page.locator("dialog[open]");
await dialog.waitFor();
check("deposit dialog defaults to the outstanding amount", (await page.inputValue("#deposit-amount")) === "24800");
await page.fill("#deposit-amount", "10000");
await dialog.getByRole("button", { name: "Reconcile deposit" }).click();
await page.getByText("deposit is short").waitFor({ timeout: 8000 });
await page.waitForTimeout(500);
check("short deposit → Awaiting transfer + Short flag", (await page.locator(".badge").allTextContents()).includes("Awaiting transfer") && (await page.textContent("body")).includes("Short"));
// Balance → completed
await page.getByRole("button", { name: "Reconcile deposit" }).click();
await page.locator("dialog[open]").waitFor();
check("second deposit defaults to the remaining 14800", (await page.inputValue("#deposit-amount")) === "14800");
await page.locator("dialog[open]").getByRole("button", { name: "Reconcile deposit" }).click();
await page.getByText("transaction is completed").waitFor({ timeout: 8000 });
await page.waitForTimeout(500);
check("exact balance → Completed, refund now offered", (await page.locator(".badge").allTextContents()).includes("Completed") && (await page.getByRole("button", { name: "Refund" }).isEnabled()));
await page.screenshot({ path: `${OUT}/application-detail-en.png` });
// Expire the overdue one
await page.goto(BASE + "/applications", { waitUntil: "networkidle" });
await page.locator("tbody tr").nth(0).getByRole("link").first().click();
await page.waitForURL(/\/applications\/[a-z0-9_]+$/);
await page.getByRole("button", { name: "Mark expired" }).click();
await page.locator("dialog[open]").getByRole("button", { name: "Mark expired" }).click();
await page.getByText("marked as expired").waitFor({ timeout: 8000 });
await page.waitForTimeout(400);
check("overdue transfer → Expired", (await page.locator(".badge").allTextContents()).includes("Expired"));
await page.goto(BASE + "/", { waitUntil: "networkidle" });
check("dashboard: no overdue badge, 1 open", (await page.getByText("1 overdue").count()) === 0 && (await page.getByText("1 open").count()) === 1);
await page.goto(BASE + "/payments", { waitUntil: "networkidle" });
check("completed transfer now in the payments list", (await page.textContent("body")).includes("ORD-DEMO-004"));

// IP restrictions: current IP verdict + list
await page.goto(BASE + "/ip-restrictions", { waitUntil: "networkidle" });
check("ip list shows 4 seeded rules", (await page.locator("tbody tr").count()) === 4);
check("block rule shown with Block badge", (await page.locator("tbody tr", { hasText: "203.0.113.200" }).textContent()).includes("Block"));
check("current IP shown", (await page.getByText("198.51.100.42").count()) >= 1);
check("current IP is on the allow-list (198.51.100.0/24)", (await page.getByText("On the allow-list").count()) === 1);
await page.screenshot({ path: `${OUT}/ip-restrictions-en.png` });
await page.goto(BASE + "/ip-restrictions/new", { waitUntil: "networkidle" });
await page.getByLabel(/^IP address \/ CIDR/).fill("10.20.30.40/24");
await page.waitForTimeout(150);
check("cidr live-normalizes host bits", (await page.getByText("Normalized: 10.20.30.0/24").count()) === 1);
await page.getByLabel(/^Label/).fill("Smoke office");
// Blocking our own address (198.51.100.42 ∈ 198.51.100.0/24) is refused
await page.fill("input.font-mono", "198.51.100.0/24");
await page.getByRole("button", { name: "Add rule" }).click();
await page.waitForSelector("p[role=alert]");
check("self-block refused with inline error", (await page.locator("p[role=alert]").first().textContent()).includes("own current IP"));
await page.fill("input.font-mono", "10.20.30.40/24");
await page.getByRole("button", { name: "Add rule" }).click();
await page.waitForURL(BASE + "/ip-restrictions", { timeout: 10000 });
await page.waitForTimeout(300);
check("rule added → 5 rows", (await page.locator("tbody tr").count()) === 5);
// A caller inside the blocked range gets the blocked screen and a 403 from the API
{
  const blockedCtx = await browser.newContext({ locale: "en-US", extraHTTPHeaders: { "x-forwarded-for": "10.20.30.7" } });
  const bp = await blockedCtx.newPage();
  const resp = await bp.goto(BASE + "/merchants", { waitUntil: "networkidle" });
  check("blocked IP sees the blocked screen", (await bp.textContent("body")).includes("Access blocked") && (await bp.locator("nav").count()) === 0, String(resp?.status()));
  const api = await bp.request.get(BASE + "/api/agents");
  check("blocked IP gets 403 from the API", api.status() === 403);
  const ok = await (await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": "10.21.0.1" } })).request.get(BASE + "/api/agents");
  check("IP outside the range still allowed", ok.status() === 200);
  await blockedCtx.close();
}
// Delete it again via the confirm dialog
const smokeRow = page.locator("tbody tr", { hasText: "Smoke office" });
await smokeRow.getByRole("button", { name: "Delete" }).click();
await page.locator("dialog[open]").getByRole("button", { name: "Delete" }).click();
await page.getByText("Rule deleted.").waitFor({ timeout: 8000 });
await page.waitForTimeout(300);
check("rule deleted → 4 rows", (await page.locator("tbody tr").count()) === 4);

// Manual
await page.goto(BASE + "/manual", { waitUntil: "networkidle" });
check("/manual redirects to the first chapter", page.url().endsWith("/manual/intro"));
check("manual TOC lists 8 chapters", (await page.locator("nav ol > li").count()) === 8);
check("manual renders a heading", (await page.locator("article h2").count()) >= 1);
await page.goto(BASE + "/manual/ip-restrictions", { waitUntil: "networkidle" });
check("chapter label shows 7 of 8", (await page.getByText("Chapter 7 of 8").count()) === 1);
await page.screenshot({ path: `${OUT}/manual-en.png` });
// Language switch flips the manual body
await page.getByRole("button", { name: "日本語" }).click();
// The body is server-rendered; the toggle triggers router.refresh().
let switched = false;
try {
  await page.locator("article h2", { hasText: "対象" }).first().waitFor({ timeout: 8000 });
  switched = true;
} catch {}
check("manual follows the language toggle (ja)", switched, await page.locator("article h2").first().textContent());
await page.screenshot({ path: `${OUT}/manual-ja.png` });
await page.getByRole("button", { name: "EN" }).click();
await page.waitForTimeout(500);

// "?" help link on a page header
await page.goto(BASE + "/merchants", { waitUntil: "networkidle" });
check("merchants page has a ? link to its chapter", (await page.locator("a[href='/manual/merchants']").count()) >= 1);

check("no page errors", pageErrors.length === 0, pageErrors.join(" | ").slice(0, 200));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
