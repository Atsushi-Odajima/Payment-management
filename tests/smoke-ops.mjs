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
  // Seeded captures are relative to "now": cover the last 10 days up to tomorrow (exclusive end).
  const isoDay = (offsetDays) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
  await page.fill("#gen-from", isoDay(-10));
  await page.fill("#gen-to", isoDay(1));
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
  check("webhook detail: transaction row shows order number and status", (await page.locator("[data-testid=webhook-payment]").innerText()).includes("ORD-DEMO-006"));
  await page.locator("dialog[open]").waitFor({ timeout: 5000 });
  check("webhook resend asks for confirmation with the transaction status", (await page.locator("dialog[open]").innerText()).includes("Failed"));
  await page.locator("dialog[open]").getByRole("button", { name: "Resend now" }).click();
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
  // Phase P3-1: live mode is unmistakable (stripe, header badge, table caption, CSV name); P3-4: flow strip.
  check("live mode: red stripe and header badge", (await page.locator("[data-testid=live-stripe]").count()) === 1 && (await page.locator("[data-testid=current-mode]").innerText()).includes("Live data"));
  check("live mode: table caption names the mode", (await page.locator("[data-testid=table-mode]").innerText()).toLowerCase().includes("live data"));
  check("deposit diffs: follow-up flow strip", (await page.locator("[data-testid=deposit-diff-flow]").innerText()).toLowerCase().includes("refund arranged"));
  const csvRes = await page.request.get(BASE + "/api/deposit-diffs?mode=live&format=csv");
  check("CSV file name carries the mode", (csvRes.headers()["content-disposition"] ?? "").includes("deposit-diffs-live.csv"));
  await page.locator("tbody tr").filter({ hasText: "Excess" }).first().getByRole("button", { name: "Request refund of excess" }).click();
  await page.locator("dialog[open]").getByRole("button", { name: "Request refund of excess" }).click();
  await page.getByText("Refund request for the excess filed").waitFor({ timeout: 8000 });
  await page.waitForTimeout(500);
  check("excess → refund arranged", (await page.textContent("body")).includes("Refund arranged"));
  check("deposit diffs: link to the refund request", (await page.getByRole("link", { name: /Open in refunds/ }).count()) >= 1);
  await page.screenshot({ path: `${OUT}/deposit-diffs-en.png` });
  await page.getByRole("group", { name: "Data mode" }).getByRole("button", { name: "Test" }).click();
  await page.waitForTimeout(800);
  await ctx.close();
}

// ── Reports / emails / announcements (Phase G) ─────────────────────────
{
  const { ctx, page } = await login("kuromaru", process.env.PASSWORD ?? "atusi0130");
  await page.getByRole("button", { name: /^Notifications/ }).click();
  check("bell pins the seeded maintenance announcement", (await page.locator("[role=region][aria-label='Pinned announcement']").textContent()).includes("Maintenance"));
  await page.keyboard.press("Escape");
  await page.mouse.click(5, 600);
  await page.goto(BASE + "/reports?granularity=custom&from=2026-08-01&to=2026-12-31", { waitUntil: "networkidle" });
  check("reports: KPI tiles and charts rendered", (await page.locator("svg[role=img]").count()) >= 2 && (await page.textContent("body")).includes("Success rate"));
  await page.screenshot({ path: `${OUT}/reports-en.png`, fullPage: true });

  await page.goto(BASE + "/email-templates", { waitUntil: "networkidle" });
  check("email templates: 24 rows", (await page.locator("tbody tr").count()) === 24);
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
  await page.getByRole("button", { name: /^Notifications/ }).click();
  check("bell pins the published incident", (await page.locator("[role=region][aria-label='Pinned announcement']").textContent()).includes("Smoke incident"));
  await page.mouse.click(5, 600);
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

// ── Phase P3-2 / P3-3: overdue tab, related deposits, reconcile preview ─
{
  const { ctx, page } = await login("kuromaru", process.env.PASSWORD ?? "atusi0130");
  await page.goto(BASE + "/applications?overdue=1", { waitUntil: "networkidle" });
  const overdueBody = await page.innerText("body");
  check("applications: overdue tab lists only the overdue transfer with its explanation", overdueBody.includes("ORD-DEMO-005") && !overdueBody.includes("ORD-DEMO-004") && overdueBody.includes("Different from the"));
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  check("dashboard: overdue badge links to the overdue tab", (await page.locator('a[href="/applications?overdue=1"]').count()) >= 1);
  await page.goto(BASE + "/applications", { waitUntil: "networkidle" });
  await page.getByText("ORD-DEMO-016").first().click();
  await page.waitForURL(/\/applications\/[a-z0-9_]+$/);
  const relBody = await page.locator("[data-testid=related-deposits]").innerText();
  check("transaction detail: related notification and linked unmatched deposit", relBody.includes("DN-00004") && relBody.includes("Linked"));
  await page.screenshot({ path: `${OUT}/related-deposits-en.png`, fullPage: true });
  await page.goto(BASE + "/applications", { waitUntil: "networkidle" });
  await page.getByText("ORD-DEMO-005").first().click();
  await page.waitForURL(/\/applications\/[a-z0-9_]+$/);
  await page.getByRole("button", { name: "Reconcile deposit" }).click();
  await page.locator("dialog[open] #deposit-amount").fill("6000");
  await page.waitForTimeout(200);
  check("reconcile dialog: short preview before confirming", (await page.locator("dialog[open] [data-testid=deposit-preview]").innerText()).includes("short by"));
  await page.locator("dialog[open] #deposit-amount").fill("6600");
  await page.waitForTimeout(200);
  check("reconcile dialog: exact preview", (await page.locator("dialog[open] [data-testid=deposit-preview]").innerText()).includes("completes"));
  await page.locator("dialog[open]").getByRole("button", { name: "Cancel" }).click();
  await ctx.close();
}

// ── Unmatched deposits + API re-notify (bank transfers only) ───────────
{
  const { ctx, page } = await login("kuromaru", process.env.PASSWORD ?? "atusi0130");
  await page.goto(BASE + "/unmatched-deposits", { waitUntil: "networkidle" });
  const udBody = await page.textContent("body");
  check("unmatched deposits: seeded open rows (forgotten id + late deposit) and header badge", udBody.includes("2 unmatched") && udBody.includes("Unmatched") && udBody.includes("Late deposit") && udBody.includes("ORD-DEMO-016"));
  await page.screenshot({ path: `${OUT}/unmatched-deposits-en.png`, fullPage: true });
  // The forgotten-id deposit (¥6,600); the late-deposit row for ORD-DEMO-016 sits above it and is handled in the Phase P1 section.
  await page.locator("tbody tr").filter({ hasText: "6,600" }).first().getByRole("button", { name: "Match by transfer ID" }).click();
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
  check("method controls: suspended row shows reason, operator and time", (await page.locator("[data-testid=suspension-details]").first().innerText()).includes("Suspended by kuromaru"));
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

// ── Notification centre (Phase J) ──────────────────────────────────────
{
  const { ctx, page } = await login("kuromaru", process.env.PASSWORD ?? "atusi0130");
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  const badge = page.locator("[data-testid=unread-badge]");
  await badge.waitFor({ timeout: 8000 });
  const unreadBefore = Number(await badge.textContent());
  check("bell shows the unread badge (seeded + smoke-generated notifications)", unreadBefore >= 3);
  await page.getByRole("button", { name: /^Notifications \(/ }).click();
  await page.getByRole("menu", { name: "Notification centre" }).waitFor({ timeout: 5000 });
  check("bell dropdown lists the latest notifications", (await page.locator("[role=menu] [role=menuitem]").count()) >= 3);
  await page.screenshot({ path: `${OUT}/notification-bell-en.png` });
  await page.locator("[role=menu] [role=menuitem]").first().click();
  await page.waitForTimeout(800);
  await page.goto(BASE + "/notifications", { waitUntil: "networkidle" });
  const listBody = await page.textContent("body");
  check("notification list shows severities and the unread count", listBody.includes("Critical") && /\d+ unread/.test(listBody));
  await page.getByRole("button", { name: "Mark all as read" }).click();
  await page.getByText("All notifications marked as read").waitFor({ timeout: 8000 });
  await page.waitForTimeout(500);
  check("mark all read → 0 unread", (await page.textContent("body")).includes("0 unread"));
  await page.screenshot({ path: `${OUT}/notifications-en.png`, fullPage: true });
  await page.goto(BASE + "/notifications/settings", { waitUntil: "networkidle" });
  check("settings: Slack disabled until configured", (await page.textContent("body")).includes("Incoming Webhook URL is configured"));
  await page.getByLabel("E-mail: Settlement generated").check();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText("Notification settings saved").waitFor({ timeout: 8000 });
  check("notification preferences saved", true);
  await page.goto(BASE + "/global-settings", { waitUntil: "networkidle" });
  await page.fill("#gs-slack", "https://hooks.slack.com/services/T000/B000/SMOKE");
  await page.getByRole("button", { name: "Send test" }).click();
  // Outside the sandbox this really posts to Slack; here the network is closed, so either outcome (sent / failed) proves the round trip.
  await page.getByText(/Test message (sent|failed)/).first().waitFor({ timeout: 15000 });
  check("Slack test send attempted and reported", true);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText("Global settings saved").waitFor({ timeout: 8000 });
  await page.goto(BASE + "/notifications/settings", { waitUntil: "networkidle" });
  check("settings: Slack column enabled once configured", await page.getByLabel("Slack: Settlement generated").isEnabled());
  await ctx.close();
}

// ── Phase P1: deposit notification log, late deposits, invoice numbers ─
{
  const { ctx, page } = await login("kuromaru", process.env.PASSWORD ?? "atusi0130");
  await page.goto(BASE + "/deposit-notifications", { waitUntil: "networkidle" });
  const logBody = await page.innerText("body");
  check("deposit notification log: seeded applied / duplicate / unmatched rows", logBody.includes("DN-00001") && logBody.includes("Duplicate") && logBody.includes("Late deposit") && logBody.includes("ORD-DEMO-016"));
  await page.screenshot({ path: `${OUT}/deposit-notifications-en.png`, fullPage: true });
  await page.goto(BASE + "/deposit-notifications?result=duplicate", { waitUntil: "networkidle" });
  check("deposit notification log: result filter", (await page.locator("tbody tr").count()) === 1);

  // Late deposit: apply the seeded deposit for the expired ORD-DEMO-016.
  await page.goto(BASE + "/unmatched-deposits", { waitUntil: "networkidle" });
  const lateRow = page.locator("tbody tr").filter({ hasText: "ORD-DEMO-016" }).first();
  await lateRow.getByRole("button", { name: "Apply as late deposit" }).click();
  await page.locator("dialog[open] #late-reason").fill("merchant agreed to ship");
  await page.locator("dialog[open]").getByRole("button", { name: "Apply as late deposit" }).click();
  await page.getByText("merchant was notified through the API").waitFor({ timeout: 10000 });
  await page.waitForTimeout(800);
  check("late deposit applied: row matched", (await page.locator("tbody tr").filter({ hasText: "ORD-DEMO-016" }).first().innerText()).includes("Matched"));
  await page.goto(BASE + "/payments", { waitUntil: "networkidle" });
  await page.getByText("ORD-DEMO-016").first().click();
  await page.waitForURL(/\/payments\/[a-z0-9_]+$/);
  const lateBody = await page.innerText("body");
  check("late deposit: transaction completed with the late-deposit event", lateBody.includes("Completed") && lateBody.includes("Late deposit applied"));
  await page.screenshot({ path: `${OUT}/late-deposit-detail-en.png`, fullPage: true });

  // Invoice number on the confirmed seeded batch.
  await page.goto(BASE + "/settlements", { waitUntil: "networkidle" });
  check("settlements list shows invoice numbers", (await page.innerText("body")).includes("INV-2026"));
  await page.locator("tbody tr").filter({ hasText: "Confirmed" }).first().click();
  await page.waitForURL(/\/settlements\/[a-z0-9_]+$/);
  check("settlement detail shows the invoice number", /INV-\d{6}-\d{5}-\d{2}/.test(await page.innerText("body")));
  check("settlement detail: tax breakdown rows (excl. / tax / incl.)", (await page.locator("[data-testid=tax-breakdown]").innerText()).includes("10%"));
  await ctx.close();
}

// ── Phase K: konbini, receipts, invoices ───────────────────────────────
{
  const { ctx, page } = await login("kuromaru", process.env.PASSWORD ?? "atusi0130");
  await page.goto(BASE + "/applications", { waitUntil: "networkidle" });
  const appsBody = await page.textContent("body");
  check("applications: konbini slip listed as awaiting payment with its receipt number", appsBody.includes("Awaiting payment") && appsBody.includes("4102-9938-27716"));
  await page.getByText("ORD-DEMO-014").first().click();
  await page.waitForURL(/\/applications\/[a-z0-9_]+$/);
  const cvsBody = await page.textContent("body");
  check("konbini detail: store, receipt number and deadline", cvsBody.includes("Konbini payment") && cvsBody.includes("Lawson") && cvsBody.includes("4102-9938-27716"));
  await page.screenshot({ path: `${OUT}/konbini-detail-en.png`, fullPage: true });

  // Receipt already issued for ORD-DEMO-015 (seed) → PDF served; issue a new one for ORD-DEMO-001.
  await page.goto(BASE + "/payments", { waitUntil: "networkidle" });
  await page.getByText("ORD-DEMO-015").first().click();
  await page.waitForURL(/\/payments\/[a-z0-9_]+$/);
  check("receipt card shows the seeded receipt number", /RC-\d{6}-00001/.test(await page.textContent("body")));
  const pdf15 = await page.request.get(page.url().replace(/\/payments\//, "/api/payments/") + "/receipt");
  check("receipt PDF is served for the seeded receipt", pdf15.status() === 200 && (pdf15.headers()["content-type"] ?? "").includes("application/pdf"));
  await page.goto(BASE + "/payments", { waitUntil: "networkidle" });
  await page.getByText("ORD-DEMO-001").first().click();
  await page.waitForURL(/\/payments\/[a-z0-9_]+$/);
  await page.getByRole("button", { name: "Issue receipt" }).click();
  const rdialog = page.locator("dialog[open]");
  await rdialog.locator("#receipt-recipient").fill("Smoke Test Co.");
  await rdialog.getByRole("button", { name: "Issue receipt" }).click();
  await page.getByText(/Receipt RC-\d{6}-\d{5} issued/).waitFor({ timeout: 8000 });
  check("receipt issued from the transaction detail", true);
  await page.waitForTimeout(600);
  check("receipt card shows the addressee and the re-issue button", (await page.textContent("body")).includes("Smoke Test Co.") && (await page.getByRole("button", { name: "Re-issue" }).count()) === 1);
  await page.screenshot({ path: `${OUT}/receipt-card-en.png`, fullPage: true });

  // Invoice PDF: confirmed batches only, from the settlement detail.
  await page.goto(BASE + "/settlements", { waitUntil: "networkidle" });
  await page.locator("tbody tr").first().click();
  await page.waitForURL(/\/settlements\/[a-z0-9_]+$/, { timeout: 10000 });
  await page.waitForLoadState("networkidle");
  const settlementBody = await page.textContent("body");
  check("settlement detail shows the invoice card and tax categories", settlementBody.includes("Invoice PDF") && settlementBody.includes("10%"));
  const invoiceRes = await page.request.get(page.url().replace(/\/settlements\//, "/api/settlements/") + "/invoice");
  check("invoice PDF served (confirmed) or refused (collecting)", (invoiceRes.status() === 200 && (invoiceRes.headers()["content-type"] ?? "").includes("application/pdf")) || invoiceRes.status() === 409, `status ${invoiceRes.status()}`);

  // Global settings: issuer registration number validation.
  await page.goto(BASE + "/global-settings", { waitUntil: "networkidle" });
  await page.fill("#gs-issuer-reg", "T123");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText("Enter T followed by 13 digits").waitFor({ timeout: 8000 });
  check("global settings: invalid registration number rejected", true);
  await page.fill("#gs-issuer-reg", "T9876543210987");
  await page.selectOption("#gs-rounding", "round");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText("Global settings saved").waitFor({ timeout: 8000 });
  check("global settings: issuer details and rounding saved", true);
  await page.screenshot({ path: `${OUT}/global-settings-invoice-en.png`, fullPage: true });
  await ctx.close();
}
{
  // Customer side: complete a payment-link checkout and download the receipt with the signed link (no admin session).
  const ctx = await browser.newContext({ viewport: { width: 480, height: 900 }, locale: "en-US" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.goto(BASE + "/pay/kotoridemolinktoken00001", { waitUntil: "networkidle" });
  await page.fill("#pay-name", "Smoke Buyer");
  await page.getByRole("button", { name: /^Pay / }).click();
  await page.getByRole("button", { name: "Complete payment (demo)" }).click();
  await page.getByText("Payment completed").waitFor({ timeout: 8000 });
  const receiptLink = page.getByRole("link", { name: "Download receipt (PDF)" });
  check("hosted page offers the receipt download after completion", (await receiptLink.count()) === 1);
  const href = await receiptLink.getAttribute("href");
  const customerPdf = await page.request.get(BASE + href);
  check("customer receipt PDF served through the signed link", customerPdf.status() === 200 && (customerPdf.headers()["content-type"] ?? "").includes("application/pdf"));
  const tampered = await page.request.get(BASE + href.replace(/&s=[^&]+$/, "&s=tampered"));
  check("tampered receipt link refused", tampered.status() === 403);
  await page.screenshot({ path: `${OUT}/pay-receipt-en.png`, fullPage: true });
  await ctx.close();
}

// ── Phase L: public API docs, merchant portal, sandbox ─────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, locale: "en-US", extraHTTPHeaders: { "x-forwarded-for": "10.98.0.1" } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => pageErrors.push(e.message));
  // Public docs: no login, generated reference present.
  await page.goto(BASE + "/docs/api", { waitUntil: "networkidle" });
  await page.waitForURL(/\/docs\/api\/intro$/);
  const docsBody = await page.textContent("body");
  check("API docs: intro chapter and generated endpoint reference", docsBody.includes("Getting started") && docsBody.includes("/transactions/{id}") && docsBody.includes("createTransaction"));
  await page.goto(BASE + "/docs/api/test-cards", { waitUntil: "networkidle" });
  check("API docs: test card table", (await page.textContent("body")).includes("4000000000000002"));
  const spec = await page.request.get(BASE + "/api/v1/openapi.json");
  check("OpenAPI JSON served", spec.status() === 200 && (await spec.json()).openapi === "3.0.3");
  await page.screenshot({ path: `${OUT}/api-docs-en.png`, fullPage: true });

  // Merchant login: wrong password, then the seeded credentials.
  await page.goto(BASE + "/merchant/login", { waitUntil: "networkidle" });
  await page.fill("#merchantCode", "MER-00001");
  await page.fill("#merchantPassword", "wrong-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByRole("alert").waitFor({ timeout: 8000 });
  check("merchant login: wrong password rejected", true);
  await page.fill("#merchantPassword", "Kotori2026Demo");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(BASE + "/merchant", { timeout: 10000 });
  const home = await page.textContent("body");
  check("merchant portal home: KPIs and recent transactions", home.includes("Completed today") && home.includes("ORD-DEMO-001"));
  check("merchant portal: no operator navigation", !home.includes("Admin users") && !home.includes("Audit log"));
  await page.screenshot({ path: `${OUT}/merchant-portal-home-en.png`, fullPage: true });

  // Transactions → refund request.
  await page.goto(BASE + "/merchant/transactions", { waitUntil: "networkidle" });
  check("merchant transactions: only own rows", (await page.textContent("body")).includes("ORD-DEMO-001") && !(await page.textContent("body")).includes("ORD-DEMO-004"));
  await page.goto(BASE + "/merchant/transactions?status=captured", { waitUntil: "networkidle" });
  await page.getByText("SUB-DEMO-0001").first().click();
  await page.waitForURL(/\/merchant\/transactions\/[a-z0-9_]+$/);
  await page.fill("#mp-refund-amount", "280");
  await page.getByRole("button", { name: "Request refund" }).click();
  await page.getByText("Refund requested").waitFor({ timeout: 8000 });
  check("merchant: refund requested from the transaction detail", true);
  await page.goto(BASE + "/merchant/refunds", { waitUntil: "networkidle" });
  check("merchant refunds list shows the request", (await page.textContent("body")).includes("SUB-DEMO-0001"));
  // Phase P3-8: the merchant issues a receipt with addressee and description.
  // SUB-DEMO-0001 (pay_demo_012, merchant1) stays completed through the smoke (its refund is only requested), so the receipt is a first issue.
  await page.goto(BASE + "/merchant/transactions/pay_demo_012", { waitUntil: "networkidle" });
  await page.locator("[data-testid=merchant-receipt]").getByRole("button", { name: "Issue receipt" }).click();
  await page.locator("dialog[open] #receipt-recipient").fill("Kotori Buyer Co.");
  await page.locator("dialog[open] #receipt-description").fill("Goods");
  await page.locator("dialog[open]").getByRole("button", { name: "Issue receipt" }).click();
  await page.getByText(/Receipt RC-/).waitFor({ timeout: 8000 });
  await page.waitForTimeout(500);
  const mrBody = await page.locator("[data-testid=merchant-receipt]").innerText();
  check("merchant receipt: number, addressee and description shown", /RC-\d{6}-\d{5}/.test(mrBody) && mrBody.includes("Kotori Buyer Co.") && mrBody.includes("Goods"));
  const mrPdf = await page.request.get(page.url().replace("/merchant/transactions/", "/api/merchant-portal/receipts/"));
  check("merchant receipt PDF served", mrPdf.status() === 200 && (mrPdf.headers()["content-type"] ?? "").includes("application/pdf"));

  // Webhook resend, settlements + invoice, API keys rotation, methods, announcements.
  await page.goto(BASE + "/merchant/webhooks", { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const [resendRes] = await Promise.all([page.waitForResponse((r) => r.url().includes("/api/merchant-portal/webhooks/") && r.url().endsWith("/resend"), { timeout: 20000 }), page.getByRole("button", { name: "Resend" }).first().click()]);
  const resendJson = await resendRes.json();
  check("merchant: webhook re-sent through the portal API", resendRes.status() === 200 && resendJson.ok === true, `status ${resendRes.status()}`);
  await page.getByText(/Re-sent/).first().waitFor({ timeout: 15000 });
  await page.goto(BASE + "/merchant/settlements", { waitUntil: "networkidle" });
  await page.locator("tbody tr a").first().click();
  await page.waitForURL(/\/merchant\/settlements\/[a-z0-9_]+$/);
  const inv = await page.request.get(page.url().replace("/merchant/settlements/", "/api/merchant-portal/settlements/") + "/invoice");
  check("merchant: invoice PDF served (confirmed) or refused (collecting)", inv.status() === 200 || inv.status() === 409, `status ${inv.status()}`);
  await page.goto(BASE + "/merchant/api-keys", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Rotate" }).first().click();
  await page.locator("dialog[open]").getByRole("button", { name: "Rotate" }).click();
  await page.getByText("New key issued").waitFor({ timeout: 8000 });
  const rotated = await page.locator("code").first().textContent();
  check("merchant: test key rotated and shown once", /^wp_test_ak_/.test(rotated ?? ""));
  check("merchant: live key read-only", (await page.textContent("body")).includes("Live keys are read-only"));
  await page.goto(BASE + "/merchant/methods", { waitUntil: "networkidle" });
  check("merchant methods: contract and suspension state", (await page.textContent("body")).includes("Suspended") && (await page.textContent("body")).includes("Not in contract"));
  await page.goto(BASE + "/merchant/announcements", { waitUntil: "networkidle" });
  check("merchant announcements page renders", (await page.textContent("body")).includes("Announcements"));

  // Sandbox: real API call with the rotated test key.
  await page.goto(BASE + "/merchant/sandbox", { waitUntil: "networkidle" });
  await page.fill("#sb-key", rotated ?? "");
  await page.selectOption("#sb-endpoint", "listTransactions");
  await page.fill("#sb-query", "limit=2");
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByText(/HTTP 200/).waitFor({ timeout: 15000 });
  check("sandbox: GET /transactions through the real API", (await page.textContent("body")).includes('"object": "transaction"'));
  await page.selectOption("#sb-endpoint", "createTransaction");
  await page.getByRole("button", { name: "Send" }).click();
  await page.getByText(/HTTP 201/).waitFor({ timeout: 15000 });
  check("sandbox: POST /transactions with a test card", (await page.textContent("body")).includes('"status": "captured"'));
  await page.screenshot({ path: `${OUT}/merchant-sandbox-en.png`, fullPage: true });

  // Logout ends the merchant session; the operator dashboard is untouched.
  await page.getByRole("button", { name: "Log out" }).click();
  await page.waitForURL(/\/merchant\/login$/, { timeout: 10000 });
  check("merchant logout returns to the portal login", true);
  await ctx.close();
}

// ── Phase M: customers, masking, unmask, anonymisation, retention settings ──
{
  const { ctx, page } = await login("kuromaru", process.env.PASSWORD ?? "atusi0130");
  await page.goto(BASE + "/customers", { waitUntil: "networkidle" });
  const list = await page.textContent("body");
  check("customers list: masked name / e-mail, real values absent", list.includes("山田 ＊＊") && list.includes("ta***@example.com") && !list.includes("taro@example.com"));
  const csv = await page.request.get(BASE + "/api/customers?format=csv");
  const csvText = await csv.text();
  check("customers CSV: masked by default", csv.status() === 200 && csvText.includes("ta***@example.com") && !csvText.includes("taro@example.com"));
  await page.screenshot({ path: `${OUT}/customers-list-en.png`, fullPage: true });
  await page.locator("tbody tr").filter({ hasText: "u_10021" }).first().click();
  await page.waitForURL(/\/customers\/[a-z0-9_]+$/);
  check("customer detail: stored card and transactions", (await page.textContent("body")).includes("4242") && (await page.textContent("body")).includes("ORD-DEMO-001"));
  await page.getByRole("button", { name: "Unmask" }).first().click();
  await page.getByText("山田 太郎").first().waitFor({ timeout: 8000 });
  check("customer detail: unmask reveals the real name with the audited marker", (await page.textContent("body")).includes("(unmasked · audited)"));
  await page.screenshot({ path: `${OUT}/customer-detail-en.png`, fullPage: true });
  await page.goto(BASE + "/audit-logs?action=pii.unmask", { waitUntil: "networkidle" });
  check("audit log: pii.unmask row written", (await page.textContent("body")).includes("Personal data unmasked"));
  // Transaction detail masks too and links to the customer record.
  await page.goto(BASE + "/payments", { waitUntil: "networkidle" });
  await page.getByText("ORD-DEMO-001").first().click();
  await page.waitForURL(/\/payments\/[a-z0-9_]+$/);
  const detail = await page.textContent("body");
  check("transaction detail: customer masked with unmask control", detail.includes("山田 ＊＊") && (await page.getByRole("button", { name: "Unmask" }).count()) > 0);
  // Manual anonymisation (admin, reason required).
  await page.goto(BASE + "/customers?q=u_10388", { waitUntil: "networkidle" });
  await page.locator("tbody tr").first().click();
  await page.waitForURL(/\/customers\/[a-z0-9_]+$/);
  await page.getByRole("button", { name: "Anonymise" }).first().click();
  const dlg = page.locator("dialog[open]");
  check("anonymise dialog: confirm disabled until a reason is given", await dlg.getByRole("button", { name: "Anonymise" }).isDisabled());
  await dlg.locator("#anonymize-reason").fill("smoke: deletion request");
  await dlg.getByRole("button", { name: "Anonymise" }).click();
  await page.getByText("Customer anonymised.").waitFor({ timeout: 8000 });
  await page.waitForTimeout(600);
  // innerText: the initial RSC payload in <script> still carries the masked name, so read the rendered text only.
  const anon = await page.locator("body").innerText();
  check("customer anonymised: badge, reason and cleared data", anon.includes("Anonymised") && anon.includes("smoke: deletion request") && !anon.includes("鈴木"));
  await page.goto(BASE + "/customers?tab=batches", { waitUntil: "networkidle" });
  check("anonymisation runs tab lists the manual run and the seeded retention run", (await page.textContent("body")).includes("Manual") && (await page.textContent("body")).includes("Retention (daily)"));
  // Global settings: retention and CSV fields.
  await page.goto(BASE + "/global-settings", { waitUntil: "networkidle" });
  check("global settings: retention months / audit years / CSV mode fields", (await page.locator("#gs-pii-months").inputValue()) === "24" && (await page.locator("#gs-audit-years").inputValue()) === "7" && (await page.locator("#gs-csv-pii").inputValue()) === "masked");
  await page.selectOption("#gs-csv-pii", "full");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText("Global settings saved").waitFor({ timeout: 8000 });
  const fullCsv = await (await page.request.get(BASE + "/api/customers?format=csv")).text();
  check("customers CSV: full values for admin once the setting is 'Full'", fullCsv.includes("taro@example.com"));
  await ctx.close();
}
{
  // Viewer: masked, no unmask / anonymise controls.
  const { ctx, page } = await login("viewer", "viewer1234");
  await page.goto(BASE + "/customers?q=u_10021", { waitUntil: "networkidle" });
  await page.locator("tbody tr").first().click();
  await page.waitForURL(/\/customers\/[a-z0-9_]+$/);
  const body = await page.textContent("body");
  check("viewer: customer detail masked without unmask, anonymise disabled", body.includes("山田 ＊＊") && (await page.getByRole("button", { name: "Unmask" }).count()) === 0 && (await page.getByRole("button", { name: "Anonymise" }).isDisabled()));
  await ctx.close();
}
{
  // Merchant portal: own customers unmasked.
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, locale: "en-US", extraHTTPHeaders: { "x-forwarded-for": "10.98.0.2" } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.goto(BASE + "/merchant/login", { waitUntil: "networkidle" });
  await page.fill("#merchantCode", "MER-00001");
  await page.fill("#merchantPassword", "Kotori2026Demo");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(BASE + "/merchant", { timeout: 10000 });
  await page.goto(BASE + "/merchant/customers", { waitUntil: "networkidle" });
  const mc = await page.textContent("body");
  check("merchant portal customers: own data shown in full", mc.includes("山田 太郎") && mc.includes("taro@example.com") && !mc.includes("u_20417"));
  await page.locator("tbody tr a").first().click();
  await page.waitForURL(/\/merchant\/customers\/[a-z0-9_]+$/);
  const md = await page.locator("body").innerText();
  check("merchant portal customer detail renders", md.includes("Stored cards (") && md.includes("Transactions ("));
  await page.screenshot({ path: `${OUT}/merchant-customers-en.png`, fullPage: true });
  await ctx.close();
}

check("no page errors", pageErrors.length === 0, pageErrors.join(" | ").slice(0, 200));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
