"use client";

// The signed-in operator, resolved server-side in app/layout.tsx from the
// session cookie and handed to client components. Role checks on the client
// (useRole().isMaster) only shape the UI; every API route re-checks the
// session (lib/api/role-guard.ts).

import { createContext, useContext, useMemo } from "react";
import type { CurrentAdmin, Role } from "@/lib/admin/types";

interface SessionContextValue {
  user: CurrentAdmin | null;
  role: Role;
  isMaster: boolean;
  isAuthenticated: boolean;
}

const SessionContext = createContext<SessionContextValue>({
  user: null,
  role: "general",
  isMaster: false,
  isAuthenticated: false,
});

export function SessionProvider({ children, user }: { children: React.ReactNode; user: CurrentAdmin | null }) {
  const value = useMemo<SessionContextValue>(
    () => ({ user, role: user?.role ?? "general", isMaster: user?.role === "master", isAuthenticated: user !== null }),
    [user],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}

/** Role helper kept for the existing call sites (payment actions, merchant password). */
export function useRole(): { role: Role; isMaster: boolean } {
  const { role, isMaster } = useContext(SessionContext);
  return { role, isMaster };
}
