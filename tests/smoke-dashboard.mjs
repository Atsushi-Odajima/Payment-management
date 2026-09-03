// Manual end-to-end smoke for the dashboard, agents, applications, IP
// restrictions and manual screens (not part of `npm test`).
//   DEMO_LOGIN_HINT=1 npx next start -p 3010 &
//   BASE=http://localhost:3010 node tests/smoke-dashboard.mjs

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3010";
const PASSWORD = process.env.PASSWORD ?? "atusi0130";
const GENERAL_PASSWORD = process.env.GENERAL_PASSWORD ?? "general1234";
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

// Login (master)
await page.goto(BASE + "/login", { waitUntil: "networkidle" });
await page.fill("#loginId", "kuromaru");
await page.fill("#password", PASSWORD);
await page.getByRole("button", { name: "Log in" }).click();
await page.waitForURL(BASE + "/");

// Dashboard: grouped cards (one per implemented screen), overdue badge, sidebar
const cards = page.locator("main ul[aria-label] > li > a");
check("dashboard shows 9 cards for master", (await cards.count()) === 9, String(await cards.count()));
const cardHrefs = await cards.evaluateAll((els) => els.map((e) => e.getAttribute("href")));
check(
  "cards link to every implemented section",
  ["/merchants", "/agents", "/payments", "/applications", "/ip-restrictions", "/manual", "/admins", "/audit-logs", "/providers"].every((h) => cardHrefs.includes(h)),
  cardHrefs.join(","),
);
check("cards are grouped under the nav group headings", (await page.locator("main section h2").allTextContents()).join("|").includes("Settings"));
check("overdue badge on applications card", (await page.getByText("1 overdue").count()) === 1);
check("applications card counts open transactions", (await page.getByText("3 open").count()) === 1);
check("no payment table on the top page", (await page.locator("main table").count()) === 0);
check("sidebar has Agents", await page.getByRole("link", { name: "Agents", exact: true }).first().isVisible());
check("sidebar has IP Restrictions", await page.getByRole("link", { name: "IP Restrictions", exact: true }).first().isVisible());
check("sidebar shows Admin Users for master", await page.getByRole("link", { name: "Admin Users", exact: true }).first().isVisible());
check("no role toggle in the header", (await page.getByRole("button", { name: "Master" }).count()) === 0);
await page.screenshot({ path: `${OUT}/dashboard-en.png` });

// Global search: Ctrl+K focuses, transfer id finds the transaction
await page.keyboard.press("Control+k");
check("Ctrl+K focuses the search box", await page.locator("#global-search").evaluate((el) => document.activeElement === el));
await page.fill("#global-search", "48213907");
await page.getByText("ORD-DEMO-004").first().waitFor({ timeout: 8000 });
check("search dropdown finds the transfer id", true);
await page.keyboard.press("Enter");
await page.waitForURL(/\/search\?q=48213907/);
check("search results page lists the transaction", (await page.textContent("body")).includes("ORD-DEMO-004") && (await page.textContent("body")).includes("Results for"));
await page.screenshot({ path: `${OUT}/search-en.png` });

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

// Admin users (master only): list, invite with one-time password, detail
await page.goto(BASE + "/admins", { waitUntil: "networkidle" });
check("admins list shows the 2 seeded accounts", (await page.locator("tbody tr").count()) === 2);
check("admins list has a CSV export link", (await page.locator("a[href='/api/admins?format=csv']").count()) === 1);
await page.goto(BASE + "/admins/new", { waitUntil: "networkidle" });
await page.getByLabel(/^Login ID/).fill("smoke.ops");
await page.getByLabel(/^Name/).fill("Smoke Operator");
await page.getByLabel(/^Email/).fill("smoke.ops@wirepay.demo");
await page.getByRole("button", { name: "Invite" }).click();
await page.getByText("Initial password issued").waitFor({ timeout: 8000 });
const initialPw = (await page.locator("dd.font-semibold").textContent()).trim();
check("invite shows a 12-char initial password once", initialPw.length === 12, initialPw);
await page.getByRole("link", { name: "Open details" }).click();
await page.waitForURL(/\/admins\/(?!new$)[a-z0-9]+$/);
check("new admin is Invited", (await page.locator(".badge").allTextContents()).includes("Invited"));
// The invited account can log in with the initial password (separate context) and becomes Active
{
  const ictx = await browser.newContext({ locale: "en-US" });
  const ip = await ictx.newPage();
  await ip.goto(BASE + "/login", { waitUntil: "networkidle" });
  await ip.fill("#loginId", "smoke.ops");
  await ip.fill("#password", initialPw);
  await ip.getByRole("button", { name: "Log in" }).click();
  await ip.waitForURL(BASE + "/");
  check("invited admin logs in with the initial password", (await ip.locator("h1").textContent()) === "Dashboard");
  check("general admin does not see Admin Users in the sidebar", (await ip.getByRole("link", { name: "Admin Users", exact: true }).count()) === 0);
  await ictx.close();
}
await page.reload({ waitUntil: "networkidle" });
check("first login turned the account Active", (await page.locator(".badge").allTextContents()).includes("Active"));

// Account page: password section + 2FA enrolment shows a QR code
await page.goto(BASE + "/account", { waitUntil: "networkidle" });
check("account page shows the profile", (await page.textContent("body")).includes("kuromaru"));
await page.getByRole("button", { name: "Set up an authenticator app" }).click();
await page.locator("img[alt='QR code for the authenticator app']").waitFor({ timeout: 8000 });
check("2FA setup renders a QR code and the manual key", (await page.textContent("body")).includes("Manual entry key"));
await page.screenshot({ path: `${OUT}/account-2fa-en.png` });
await page.getByRole("button", { name: "Cancel" }).click();

// Audit log: the actions above are recorded; detail shows the diff
await page.goto(BASE + "/audit-logs", { waitUntil: "networkidle" });
const auditBody = await page.textContent("body");
check("audit log lists login, invite and deposit entries", auditBody.includes("Logged in") && auditBody.includes("Invited admin") && auditBody.includes("Reconciled deposit"));
await page.selectOption("select:near(:text('Action'))", "payment.deposit");
await page.waitForURL(/action=payment.deposit/);
await page.waitForTimeout(400);
check("audit filter by action narrows the list", (await page.locator("tbody tr").count()) >= 2 && !(await page.locator("tbody").textContent()).includes("Invited admin"));
await page.locator("tbody tr").first().click();
await page.waitForURL(/\/audit-logs\/[a-z0-9_]+$/);
check("audit detail shows before / after values", (await page.textContent("body")).includes("Before") && (await page.textContent("body")).includes("awaiting_transfer"));
await page.screenshot({ path: `${OUT}/audit-log-detail-en.png` });

// General role (separate session): read-only transaction actions, no admin menu
{
  const gctx = await browser.newContext({ locale: "en-US", extraHTTPHeaders: { "x-forwarded-for": "198.51.100.43" } });
  const gp = await gctx.newPage();
  await gp.goto(BASE + "/login", { waitUntil: "networkidle" });
  await gp.fill("#loginId", "general");
  await gp.fill("#password", GENERAL_PASSWORD);
  await gp.getByRole("button", { name: "Log in" }).click();
  await gp.waitForURL(BASE + "/");
  check("general role sees 8 cards (no Admin Users)", (await gp.locator("main ul[aria-label] > li > a").count()) === 8);
  await gp.goto(BASE + "/applications/pay_demo_003", { waitUntil: "networkidle" });
  check("general role: Mark completed disabled with hint", await gp.getByRole("button", { name: "Mark completed" }).isDisabled());
  const res = await gp.goto(BASE + "/admins", { waitUntil: "networkidle" });
  check("general role is redirected away from /admins", !gp.url().endsWith("/admins"), gp.url());
  await gctx.close();
}

// Manual
await page.goto(BASE + "/manual", { waitUntil: "networkidle" });
check("/manual redirects to the first chapter", page.url().endsWith("/manual/intro"));
check("manual TOC lists 9 chapters", (await page.locator("nav ol > li").count()) === 9);
check("manual renders a heading", (await page.locator("article h2").count()) >= 1);
await page.goto(BASE + "/manual/ip-restrictions", { waitUntil: "networkidle" });
check("chapter label shows 7 of 9", (await page.getByText("Chapter 7 of 9").count()) === 1);
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
