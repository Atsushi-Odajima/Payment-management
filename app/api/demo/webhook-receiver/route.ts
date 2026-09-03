import { ok, withApiHandler } from "@/lib/api/handler";

/**
 * Demo receiver for merchant webhooks. The seeded merchants notify this URL
 * so deliveries can be watched end to end. The query selects the behaviour:
 *   ?result=ok       → 200 (default)
 *   ?result=error    → 500
 *   ?result=timeout  → waits longer than the 10 s delivery timeout
 * The request is echoed back (headers and body) so the log shows both sides.
 */
async function handle(req: Request) {
  const url = new URL(req.url);
  const result = url.searchParams.get("result") ?? "ok";
  const body = req.method === "GET" ? null : await req.text();
  if (result === "timeout") {
    await new Promise((r) => setTimeout(r, 12_000));
  }
  const echo = {
    received: true,
    method: req.method,
    signature: req.headers.get("x-signature"),
    timestamp: req.headers.get("x-timestamp"),
    contentType: req.headers.get("content-type"),
    query: Object.fromEntries(url.searchParams.entries()),
    body,
  };
  if (result === "error") {
    return Response.json({ ok: false, error: { code: "demo_receiver_error", message: "simulated failure" }, echo }, { status: 500 });
  }
  return ok(echo);
}

export const GET = withApiHandler(handle, { ipRestricted: false });
export const POST = withApiHandler(handle, { ipRestricted: false });
