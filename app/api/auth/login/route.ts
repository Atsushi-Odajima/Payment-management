import { z } from "zod";
import { ApiError, ok, readJson, withApiHandler } from "@/lib/api/handler";
import {
  SESSION_COOKIE,
  SESSION_TTL_SEC,
  createSessionToken,
  isAuthConfigured,
  sessionCookieAttributes,
  verifyPassword,
} from "@/lib/auth";

const Body = z.object({ password: z.string().min(1).max(200) });

export const POST = withApiHandler(async (req) => {
  if (!isAuthConfigured()) {
    throw new ApiError(400, "auth_not_configured", "errors.authNotConfigured");
  }
  const { password } = Body.parse(await readJson(req));
  if (!verifyPassword(password)) {
    throw new ApiError(401, "invalid_credentials", "errors.invalidCredentials");
  }
  const token = await createSessionToken();
  const res = ok({ authenticated: true });
  res.headers.append(
    "set-cookie",
    `${SESSION_COOKIE}=${token}; ${sessionCookieAttributes(SESSION_TTL_SEC)}`,
  );
  return res;
});
