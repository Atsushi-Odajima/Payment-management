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

let loginSeq = 0;
async function login(loginId, password) {
  // Each session gets its own client address so the per-IP login rate limit (10 / window) never trips across the smoke's logins.
  loginSeq += 1;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, locale: "en-US", extraHTTPHeaders: { "x-forwarded-for": `10.99.${Math.floor(loginSeq / 250)}.${loginSeq % 250}` } });
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

// ── Settlements (Phase D) ──────────────────────────────────────────────
{
  const { ctx, page } = await login("kuromaru", process.env.PASSWORD ?? "atusi0130");
  await page.goto(BASE + "/settlements", { waitUntil: "networkidle" });
  check("settlements list: seeded batches (paid + confirmed)", (await page.locator("tbody tr").count()) === 2);
  const merchantValue = await page.locator("#gen-merchant option", { hasText: "MER-00001" }).getAttribute("value");
  await page.selectOption("#gen-merchant", merchantValue);
  await page.fill("#gen-from", "2026-08-25");
  await page.fill("#gen-to", "2026-09-03");
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await page.waitForURL(/\/settlements\/[a-z0-9_]+$/, { timeout: 10000 });
  await page.getByText("Settlement batch generated").waitFor({ timeout: 8000 });
  check("generate → detail with lines", (await page.locator("table tbody tr").count()) >= 1);
  await page.screenshot({ path: `${OUT}/settlement-detail-en.png` });
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await page.locator("dialog[open]").getByRole("button", { name: "Confirm", exact: true }).click();
  await page.getByText("Settlement confirmed").waitFor({ timeout: 8000 });
  await page.waitForTimeout(500);
  check("confirm → Confirmed badge", (await page.textContent("body")).includes("Confirmed"));
  await page.getByRole("button", { name: "Hold", exact: true }).click();
  await page.locator("dialog[open] #hold-reason").fill("dispute");
  await page.locator("dialog[open]").getByRole("button", { name: "Hold", exact: true }).click();
  await page.getByText("put on hold").waitFor({ timeout: 8000 });
  await page.waitForTimeout(500);
  check("hold with reason → Held", (await page.textContent("body")).includes("dispute"));
  const csv = await page.evaluate(async () => {
    const id = location.pathname.split("/").pop();
    const r = await fetch(`/api/settlements/${id}/lines?format=csv`);
    return { status: r.status, type: r.headers.get("content-type") };
  });
  check("lines CSV served", csv.status === 200 && (csv.type ?? "").includes("text/csv"));
  // Merchant settlement tab
  await page.goto(BASE + "/merchants", { waitUntil: "networkidle" });
  await page.locator("tbody tr").first().click();
  await page.waitForURL(/\/merchants\/[a-z0-9_]+$/);
  await page.getByRole("link", { name: "Settlement", exact: true }).click();
  await page.waitForURL(/tab=settlement$/);
  check("merchant settlement tab lists batches", (await page.locator("section[aria-labelledby=st-batches] li").count()) >= 2);
  await page.fill("#st-fee", "440");
  await page.getByRole("button", { name: "Save settlement settings" }).click();
  await page.getByText("Settlement settings saved").waitFor({ timeout: 8000 });
  check("settlement settings saved", true);
  await ctx.close();
}

// ── Webhook log (Phase E) ──────────────────────────────────────────────
{
  const { ctx, page } = await login("kuromaru", process.env.PASSWORD ?? "atusi0130");
  await page.goto(BASE + "/webhook-logs", { waitUntil: "networkidle" });
  const first = await page.locator("tbody tr").first().textContent();
  check("webhook log: abandoned delivery listed first", first.includes("Abandoned"));
  check("webhook log: failed badge in header", (await page.textContent("body")).includes("failed / retrying"));
  await page.locator("tbody tr").filter({ hasText: "Retrying" }).first().click();
  await page.waitForURL(/\/webhook-logs\/[a-z0-9_]+$/);
  check("webhook detail shows request headers with signature", (await page.textContent("body")).includes("X-Signature"));
  await page.getByRole("button", { name: "Resend now" }).click();
  await page.getByText(/Resent/).waitFor({ timeout: 15000 });
  await page.waitForTimeout(500);
  check("manual resend adds an attempt (demo receiver answers 500)", (await page.locator("section[aria-labelledby=wh-attempts] li").count()) === 3);
  await page.screenshot({ path: `${OUT}/webhook-detail-en.png` });
  // Completing a transaction emits a delivery to the demo receiver (result=ok → success).
  await page.goto(BASE + "/applications", { waitUntil: "networkidle" });
  await page.getByText("ORD-DEMO-003").first().click();
  await page.waitForURL(/\/applications\/[a-z0-9_]+$/);
  await page.getByRole("button", { name: "Mark completed" }).click();
  await page.locator("dialog[open]").getByRole("button", { name: "Mark completed" }).click();
  // The success notice (role=status) appears once the action — and its webhook attempt — finished.
  await page.locator("aside [role=status]").first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(500);
  // ORD-DEMO-003 belongs to merchant2 whose demo receiver answers 500 → the new delivery is retrying.
  await page.goto(BASE + "/webhook-logs?event=payment.completed", { waitUntil: "networkidle" });
  check("capture emitted a payment.completed delivery", (await page.locator("tbody tr").filter({ hasText: "payment.completed" }).count()) >= 3);
  check("delivery to the failing receiver is retrying", (await page.locator("tbody tr").filter({ hasText: "Retrying" }).count()) >= 1);
  await ctx.close();
}

// ── Risk (Phase F) ─────────────────────────────────────────────────────
{
  const { ctx, page } = await login("kuromaru", process.env.PASSWORD ?? "atusi0130");
  await page.goto(BASE + "/chargebacks", { waitUntil: "networkidle" });
  check("chargebacks: seeded received case first", (await page.locator("tbody tr").first().textContent()).includes("Received"));
  await page.locator("tbody tr").first().click();
  await page.waitForURL(/\/chargebacks\/[a-z0-9_]+$/);
  await page.getByRole("button", { name: "Dispute", exact: true }).click();
  await page.locator("dialog[open] #cb-note-field").fill("tracking number 1234");
  await page.locator("dialog[open]").getByRole("button", { name: "Dispute", exact: true }).click();
  await page.getByText("Dispute filed").waitFor({ timeout: 8000 });
  await page.waitForTimeout(500);
  check("chargeback dispute → Disputed", (await page.textContent("body")).includes("Disputed"));
  await page.getByRole("button", { name: "Record loss" }).click();
  await page.locator("dialog[open]").getByRole("button", { name: "Record loss" }).click();
  await page.getByText("Loss recorded").waitFor({ timeout: 8000 });
  await page.waitForTimeout(500);
  check("chargeback loss → transaction shows Chargeback", (await page.textContent("body")).includes("Chargeback"));
  await page.screenshot({ path: `${OUT}/chargeback-detail-en.png` });

  await page.goto(BASE + "/blacklist", { waitUntil: "networkidle" });
  check("blacklist: seeded candidate first", (await page.locator("tbody tr").first().textContent()).includes("Candidate"));
  await page.locator("tbody tr").first().getByRole("button", { name: "Approve" }).click();
  await page.getByText("Entry enabled").waitFor({ timeout: 8000 });
  await page.waitForTimeout(500);
  check("candidate approved → Active", (await page.locator("tbody tr").filter({ hasText: "Active" }).count()) >= 2);
  await page.fill("#bl-value", "203.0.113.99");
  await page.fill("#bl-reason", "smoke");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByText("Added to the blacklist").waitFor({ timeout: 8000 });
  check("manual blacklist entry added", true);
  await page.fill("#rs-max", "4");
  await page.getByRole("button", { name: "Save detection rule" }).click();
  await page.getByText("Detection rule saved").waitFor({ timeout: 8000 });
  check("detection rule saved", true);

  // Deposit differences are seeded in live mode.
  await page.getByRole("group", { name: "Data mode" }).getByRole("button", { name: "Live" }).click();
  await page.waitForTimeout(800);
  await page.goto(BASE + "/deposit-diffs", { waitUntil: "networkidle" });
  check("deposit diffs: 2 open cases in live mode", (await page.textContent("body")).includes("2 open"));
  await page.locator("tbody tr").filter({ hasText: "Excess" }).first().getByRole("button", { name: "Request refund of excess" }).click();
  await page.locator("dialog[open]").getByRole("button", { name: "Request refund of excess" }).click();
  await page.getByText("Refund request for the excess filed").waitFor({ timeout: 8000 });
  await page.waitForTimeout(500);
  check("excess → refund arranged", (await page.textContent("body")).includes("Refund arranged"));
  await page.screenshot({ path: `${OUT}/deposit-diffs-en.png` });
  await page.getByRole("group", { name: "Data mode" }).getByRole("button", { name: "Test" }).click();
  await page.waitForTimeout(800);
  await ctx.close();
}

// ── Reports / emails / announcements (Phase G) ─────────────────────────
{
  const { ctx, page } = await login("kuromaru", process.env.PASSWORD ?? "atusi0130");
  check("header banner shows the seeded maintenance announcement", (await page.locator("[role=region][aria-label='Announcement banner']").textContent()).includes("Maintenance"));
  await page.goto(BASE + "/reports?granularity=custom&from=2026-08-01&to=2026-12-31", { waitUntil: "networkidle" });
  check("reports: KPI tiles and charts rendered", (await page.locator("svg[role=img]").count()) >= 2 && (await page.textContent("body")).includes("Success rate"));
  await page.screenshot({ path: `${OUT}/reports-en.png`, fullPage: true });

  await page.goto(BASE + "/email-templates", { waitUntil: "networkidle" });
  check("email templates: 16 rows", (await page.locator("tbody tr").count()) === 16);
  await page.locator("tbody tr").first().getByRole("link").first().click();
  await page.waitForURL(/\/email-templates\/[a-z0-9_]+$/);
  await page.fill("#tpl-subject", "Smoke subject {{orderNumber}}");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText("Template saved").waitFor({ timeout: 8000 });
  check("email template saved with placeholder preview", (await page.textContent("body")).includes("Smoke subject ORD-DEMO-001"));

  await page.goto(BASE + "/email-logs", { waitUntil: "networkidle" });
  check("email log lists seeded + generated emails", (await page.locator("tbody tr").count()) >= 2);

  await page.goto(BASE + "/announcements/new", { waitUntil: "networkidle" });
  await page.selectOption("#an-kind", "incident");
  await page.fill("#an-title", "Smoke incident");
  await page.fill("#an-body", "Card authorizations are slow");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page.waitForURL(/\/announcements\/[a-z0-9_]+$/, { timeout: 10000 });
  await page.getByText("Announcement published").waitFor({ timeout: 8000 });
  await page.waitForTimeout(500);
  check("incident published with an occurred entry", (await page.textContent("body")).includes("Occurred"));
  await page.getByLabel("Update", { exact: true }).fill("Root cause found");
  await page.getByLabel("Phase").selectOption("investigating");
  await page.getByRole("button", { name: "Add update" }).click();
  await page.getByText("Update added").waitFor({ timeout: 8000 });
  await page.waitForTimeout(500);
  check("incident timeline has the investigating update", (await page.textContent("body")).includes("Investigating"));
  check("red incident banner visible", (await page.locator("[role=region][aria-label='Announcement banner']").textContent()).includes("Smoke incident"));
  await page.screenshot({ path: `${OUT}/announcement-detail-en.png` });
  await ctx.close();
}

// ── Subscriptions / payment links / agent fees (Phase H) ───────────────
{
  const { ctx, page } = await login("kuromaru", process.env.PASSWORD ?? "atusi0130");
  await page.goto(BASE + "/subscriptions", { waitUntil: "networkidle" });
  const subsBody = await page.textContent("body");
  check("subscriptions: seeded rows and plans", (await page.locator("tbody tr").count()) >= 2 && subsBody.includes("Past due") && subsBody.includes("Billing plans"));
  await page.screenshot({ path: `${OUT}/subscriptions-en.png`, fullPage: true });
  await page.goto(BASE + "/subscriptions/sub_demo_001", { waitUntil: "networkidle" });
  check("subscription detail shows the seeded charge", (await page.textContent("body")).includes("Charge history (1)"));
  await page.getByRole("button", { name: "Charge now (success)" }).click();
  await page.locator("dialog[open]").getByRole("button", { name: "Charge now (success)" }).click();
  await page.getByText("Charged.").waitFor({ timeout: 10000 });
  await page.waitForTimeout(800);
  check("charge now → history grows and stays active", (await page.textContent("body")).includes("Charge history (2)"));
  await page.getByRole("button", { name: "Charge now (simulate failure)" }).click();
  await page.locator("dialog[open]").getByRole("button", { name: "Charge now (simulate failure)" }).click();
  await page.getByText("Charge failure recorded.").waitFor({ timeout: 10000 });
  await page.waitForTimeout(800);
  check("simulated failure → past due with 1 failure", (await page.textContent("body")).includes("Past due"));
  await page.screenshot({ path: `${OUT}/subscription-detail-en.png`, fullPage: true });

  await page.goto(BASE + "/payment-links", { waitUntil: "networkidle" });
  check("payment links: seeded rows", (await page.locator("tbody tr").count()) >= 2);
  await page.goto(BASE + "/payment-links/plk_demo_001", { waitUntil: "networkidle" });
  check("payment link detail: QR and URL", (await page.locator("img[alt='QR code of the checkout page']").count()) === 1 && (await page.textContent("body")).includes("/pay/kotoridemolinktoken00001"));
  await page.screenshot({ path: `${OUT}/payment-link-detail-en.png`, fullPage: true });
  await ctx.close();

  // The hosted checkout is public: fresh context, no session.
  const pub = await browser.newContext({ locale: "en-US", viewport: { width: 480, height: 900 } });
  const pay = await pub.newPage();
  pay.on("pageerror", (e) => pageErrors.push(`pay: ${e.message}`));
  await pay.goto(BASE + "/pay/kotoridemolinktoken00001", { waitUntil: "networkidle" });
  check("hosted checkout renders without admin chrome", (await pay.textContent("body")).includes("Payment method") && (await pay.locator("aside").count()) === 0);
  await pay.screenshot({ path: `${OUT}/pay-page-en.png`, fullPage: true });
  await pay.fill("#pay-name", "Smoke Customer");
  await pay.getByRole("button", { name: /^Pay/ }).click();
  await pay.getByRole("button", { name: "Complete payment (demo)" }).waitFor({ timeout: 10000 });
  await pay.getByRole("button", { name: "Complete payment (demo)" }).click();
  await pay.getByText("Payment completed").waitFor({ timeout: 10000 });
  check("hosted checkout completes a demo payment", true);
  await pay.screenshot({ path: `${OUT}/pay-page-done-en.png`, fullPage: true });
  await pub.close();

  const { ctx: ctx2, page: page2 } = await login("kuromaru", process.env.PASSWORD ?? "atusi0130");
  await page2.goto(BASE + "/payment-links/plk_demo_001", { waitUntil: "networkidle" });
  check("payment link usage shows the new transaction", (await page2.textContent("body")).includes("Transactions from this link (2)"));
  const d = new Date();
  const lastMonth = `${d.getUTCMonth() === 0 ? d.getUTCFullYear() - 1 : d.getUTCFullYear()}-${String(d.getUTCMonth() === 0 ? 12 : d.getUTCMonth()).padStart(2, "0")}`;
  await page2.goto(BASE + `/agent-fees?month=${lastMonth}`, { waitUntil: "networkidle" });
  const feesBody = await page2.textContent("body");
  check("agent fees: seeded paid settlement yields AGT-00001 fee", feesBody.includes("AGT-00001") && feesBody.includes("4,216"));
  await page2.getByRole("button", { name: "Show breakdown" }).first().click();
  check("agent fees breakdown lists the merchant", (await page2.textContent("body")).includes("MER-00001"));
  await page2.screenshot({ path: `${OUT}/agent-fees-en.png`, fullPage: true });
  await page2.goto(BASE + "/agents/agt_demo_001", { waitUntil: "networkidle" });
  check("agent detail shows the fee summary", (await page2.textContent("body")).includes("Agent fees ("));
  await page2.goto(BASE + "/", { waitUntil: "networkidle" });
  const dash = await page2.textContent("body");
  check("dashboard: Phase H cards", dash.includes("Subscriptions") && dash.includes("Payment Links") && dash.includes("Agent Fees") && dash.includes("This month"));
  await ctx2.close();
}

// ── Unmatched deposits + API re-notify (bank transfers only) ───────────
{
  const { ctx, page } = await login("kuromaru", process.env.PASSWORD ?? "atusi0130");
  await page.goto(BASE + "/unmatched-deposits", { waitUntil: "networkidle" });
  const udBody = await page.textContent("body");
  check("unmatched deposits: seeded open row and header badge", udBody.includes("1 unmatched") && udBody.includes("Unmatched"));
  await page.screenshot({ path: `${OUT}/unmatched-deposits-en.png`, fullPage: true });
  await page.getByRole("button", { name: "Match by transfer ID" }).first().click();
  // The candidate list suggests the awaiting transfer with the same amount (ORD-DEMO-005 → 7301256); pick it.
  await page.locator("dialog[open]").getByRole("button", { name: /7301256/ }).click();
  check("match dialog: candidate fills the transfer id", (await page.locator("dialog[open] #match-transfer-id").inputValue()) === "7301256");
  await page.locator("dialog[open]").getByRole("button", { name: "Match by transfer ID" }).click();
  await page.getByText("merchant was notified through the API").waitFor({ timeout: 10000 });
  await page.waitForTimeout(800);
  check("matched deposit links to the completed transaction", (await page.textContent("body")).includes("ORD-DEMO-005") && (await page.textContent("body")).includes("Matched"));
  await page.locator("tbody tr").filter({ hasText: "ORD-DEMO-005" }).first().getByRole("link", { name: "ORD-DEMO-005" }).click();
  await page.waitForURL(/\/payments\/[a-z0-9_]+$/);
  check("transaction completed by the match", (await page.textContent("body")).includes("Completed"));
  await page.getByRole("button", { name: "API re-notify" }).click();
  await page.locator("dialog[open]").getByRole("button", { name: "API re-notify" }).click();
  await page.getByText("API re-notification sent").waitFor({ timeout: 10000 });
  await page.waitForTimeout(800);
  check("API re-notify recorded on the transaction", (await page.textContent("body")).includes("Last re-notified"));
  await page.screenshot({ path: `${OUT}/payment-renotify-en.png`, fullPage: true });
  await page.goto(BASE + "/webhook-logs", { waitUntil: "networkidle" });
  // ORD-DEMO-005 belongs to MER-00003: the match and the re-notify each produced a payment.completed delivery.
  check("webhook log lists the re-sent payment.completed deliveries", (await page.locator("tbody tr").filter({ hasText: "MER-00003" }).filter({ hasText: "payment.completed" }).count()) >= 2);
  // Card payments never get the button.
  await page.goto(BASE + "/payments/pay_demo_001", { waitUntil: "networkidle" });
  check("no API re-notify on a card payment", (await page.getByRole("button", { name: "API re-notify" }).count()) === 0);
  await ctx.close();
}

// ── Roles / notes / payment-method suspension (Phase I) ────────────────
{
  // viewer: read-only navigation, no action buttons, CSV refused.
  const { ctx: vctx, page: vpage } = await login("viewer", "viewer1234");
  await vpage.goto(BASE + "/refunds", { waitUntil: "networkidle" });
  await vpage.locator("tbody tr").first().click();
  await vpage.waitForURL(/\/refunds\/[a-z0-9_]+$/);
  check("viewer: refund detail has no enabled Approve button", (await vpage.getByRole("button", { name: "Approve" }).filter({ hasNot: vpage.locator("[disabled]") }).count()) === 0 || (await vpage.getByRole("button", { name: "Approve" }).isDisabled()));
  const sidebar = await vpage.locator("aside").first().textContent();
  check("viewer: no Admin Users / Global Settings in the sidebar", !sidebar.includes("Admin Users") && !sidebar.includes("Global Settings"));
  const csv = await vpage.request.get(BASE + "/api/merchants?format=csv");
  check("viewer: CSV export refused (403)", csv.status() === 403);
  await vctx.close();

  // accounting: approves the seeded refund.
  const { ctx: actx, page: apage } = await login("accounting", "accounting1234");
  await apage.goto(BASE + "/refunds", { waitUntil: "networkidle" });
  await apage.locator("tbody tr").filter({ hasText: "ORD-DEMO-002" }).first().click();
  await apage.waitForURL(/\/refunds\/[a-z0-9_]+$/);
  check("accounting: Approve button enabled", await apage.getByRole("button", { name: "Approve" }).isEnabled());
  await actx.close();

  // admin: roles list on the admin detail, note on the timeline, global suspension + banner.
  const { ctx, page } = await login("kuromaru", process.env.PASSWORD ?? "atusi0130");
  await page.goto(BASE + "/admins", { waitUntil: "networkidle" });
  check("admins list shows five roles", (await page.locator("tbody tr").count()) === 5);
  await page.locator("tbody tr").filter({ hasText: "accounting" }).first().click();
  await page.waitForURL(/\/admins\/[a-z0-9_]+$/);
  check("admin detail lists what the role can do", (await page.textContent("body")).includes("What this role can do") && (await page.textContent("body")).includes("Settlement batches"));

  await page.goto(BASE + "/payments/pay_demo_001", { waitUntil: "networkidle" });
  await page.fill("#note-body", "Smoke note: customer confirmed by phone");
  await page.getByLabel("Pin it (icon on the list row)").check();
  await page.getByRole("button", { name: "Post", exact: true }).click();
  await page.getByText("Note posted").waitFor({ timeout: 8000 });
  await page.waitForTimeout(500);
  check("note appears on the merged timeline", (await page.textContent("body")).includes("Smoke note: customer confirmed by phone"));
  await page.screenshot({ path: `${OUT}/payment-timeline-en.png`, fullPage: true });
  await page.goto(BASE + "/payments", { waitUntil: "networkidle" });
  check("pinned note icon on the list row", (await page.locator("tbody tr").filter({ hasText: "ORD-DEMO-001" }).locator("svg[aria-label='Has pinned notes']").count()) === 1);

  await page.goto(BASE + "/payment-method-controls", { waitUntil: "networkidle" });
  await page.getByRole("switch", { name: "Accept Credit Card Payments" }).click();
  await page.locator("dialog[open] #mc-reason").fill("Smoke: acquirer outage");
  await page.locator("dialog[open]").getByRole("button", { name: "Suspend" }).click();
  await page.getByText("suspended.").waitFor({ timeout: 8000 });
  // Decline the announcement draft prompt.
  await page.locator("dialog[open]").getByRole("button", { name: "Cancel" }).click();
  await page.waitForTimeout(800);
  check("red banner shows the globally suspended method", (await page.locator("[role=region][aria-label='Payment method suspension banner']").textContent()).includes("Credit Card"));
  await page.screenshot({ path: `${OUT}/payment-method-controls-en.png`, fullPage: true });
  await page.goto(BASE + "/payments/new", { waitUntil: "networkidle" });
  check("new payment form hides the suspended method", !(await page.locator("#providerId").textContent()).includes("Stripe"));
  await page.goto(BASE + "/payment-method-controls", { waitUntil: "networkidle" });
  await page.getByRole("switch", { name: "Accept Credit Card Payments" }).click();
  await page.locator("dialog[open]").getByRole("button", { name: "Resume" }).click();
  await page.getByText("resumed.").waitFor({ timeout: 8000 });
  await page.waitForTimeout(500);
  check("banner gone after resume", (await page.locator("[role=region][aria-label='Payment method suspension banner']").count()) === 0);
  await page.goto(BASE + "/merchants/mer_demo_002?tab=methods", { waitUntil: "networkidle" });
  check("merchant methods tab shows the seeded QR suspension", (await page.textContent("body")).includes("Not accepting"));
  await ctx.close();
}

check("no page errors", pageErrors.length === 0, pageErrors.join(" | ").slice(0, 200));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
