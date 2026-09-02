import { ok, withApiHandler } from "@/lib/api/handler";
import { SESSION_COOKIE, sessionCookieAttributes } from "@/lib/auth";

export const POST = withApiHandler(async () => {
  const res = ok({ authenticated: false });
  res.headers.append("set-cookie", `${SESSION_COOKIE}=; ${sessionCookieAttributes(0)}`);
  return res;
});
