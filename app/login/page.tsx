import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LoginView } from "@/components/views/login-view";
import { SESSION_COOKIE, isAuthConfigured, verifySessionToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await verifySessionToken(cookies().get(SESSION_COOKIE)?.value)) redirect("/");
  return (
    <LoginView configured={isAuthConfigured()} demoHint={process.env.DEMO_LOGIN_HINT || undefined} />
  );
}
