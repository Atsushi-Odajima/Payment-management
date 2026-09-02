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
check("pending badge on applications card", (await page.getByText("2 pending").count()) === 1);
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

// Applications
await page.goto(BASE + "/applications", { waitUntil: "networkidle" });
const appRows = page.locator("tbody tr");
check("applications list shows 4 rows", (await appRows.count()) === 4);
const firstTwo = [await appRows.nth(0).textContent(), await appRows.nth(1).textContent()];
check("pending applications listed first", firstTwo.every((t) => t.includes("Pending")));
await page.screenshot({ path: `${OUT}/applications-en.png` });
await appRows.first().click();
await page.waitForURL(/\/applications\/[a-z0-9_]+$/);
check("general role sees no Approve button", (await page.getByRole("button", { name: "Approve" }).count()) === 0);
await page.getByRole("button", { name: "Master" }).click();
await page.waitForTimeout(600);
check("master role sees Approve / Reject / Return", (await page.getByRole("button", { name: "Approve" }).count()) === 1 && (await page.getByRole("button", { name: "Return" }).count()) === 1);
// Reject requires a reason: confirm button disabled until typed
await page.getByRole("button", { name: "Reject" }).click();
const dialog = page.locator("dialog[open]");
await dialog.waitFor();
const confirmBtn = dialog.getByRole("button", { name: "Reject" });
check("reject: confirm disabled without a reason", await confirmBtn.isDisabled());
await dialog.getByLabel(/^Reason/).fill("Documents incomplete");
check("reject: confirm enabled with a reason", await confirmBtn.isEnabled());
await dialog.getByRole("button", { name: "Cancel" }).click();
await page.waitForTimeout(200);
// Approve
await page.getByRole("button", { name: "Approve" }).click();
await page.locator("dialog[open]").getByRole("button", { name: "Approve" }).click();
await page.getByText("Application approved").waitFor({ timeout: 8000 });
await page.waitForTimeout(500);
check("approve → status Approved, actions gone", (await page.getByText("Approved").count()) >= 1 && (await page.getByRole("button", { name: "Approve" }).count()) === 0);
await page.screenshot({ path: `${OUT}/application-detail-en.png` });
await page.goto(BASE + "/", { waitUntil: "networkidle" });
check("dashboard badge drops to 1 pending", (await page.getByText("1 pending").count()) === 1);

// IP restrictions: current IP verdict + list
await page.goto(BASE + "/ip-restrictions", { waitUntil: "networkidle" });
check("ip list shows 3 seeded rules", (await page.locator("tbody tr").count()) === 3);
check("current IP shown", (await page.getByText("198.51.100.42").count()) >= 1);
check("current IP is on the allow-list (198.51.100.0/24)", (await page.getByText("On the allow-list").count()) === 1);
await page.screenshot({ path: `${OUT}/ip-restrictions-en.png` });
await page.goto(BASE + "/ip-restrictions/new", { waitUntil: "networkidle" });
await page.getByLabel(/^IP address \/ CIDR/).fill("10.20.30.40/24");
await page.waitForTimeout(150);
check("cidr live-normalizes host bits", (await page.getByText("Normalized: 10.20.30.0/24").count()) === 1);
await page.getByLabel(/^Label/).fill("Smoke office");
await page.getByRole("button", { name: "Add rule" }).click();
await page.waitForURL(BASE + "/ip-restrictions", { timeout: 10000 });
await page.waitForTimeout(300);
check("rule added → 4 rows", (await page.locator("tbody tr").count()) === 4);
// Delete it again via the confirm dialog
const smokeRow = page.locator("tbody tr", { hasText: "Smoke office" });
await smokeRow.getByRole("button", { name: "Delete" }).click();
await page.locator("dialog[open]").getByRole("button", { name: "Delete" }).click();
await page.getByText("Rule deleted.").waitFor({ timeout: 8000 });
await page.waitForTimeout(300);
check("rule deleted → 3 rows", (await page.locator("tbody tr").count()) === 3);

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
