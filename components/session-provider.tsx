"use client";

// The signed-in operator, resolved server-side in app/layout.tsx from the
// session cookie and handed to client components. Permission checks on the
// client (useCan) only shape the UI; every API route re-checks the session
// against the same matrix (lib/role.ts via lib/api/role-guard.ts).

import { createContext, useCallback, useContext, useMemo } from "react";
import type { CurrentAdmin } from "@/lib/admin/types";
import { DEFAULT_ROLE, can as canRole, type ActionOf, type Resource, type Role } from "@/lib/role";

interface SessionContextValue {
  user: CurrentAdmin | null;
  role: Role;
  /** admin role (the former "master"). */
  isAdmin: boolean;
  isAuthenticated: boolean;
}

const SessionContext = createContext<SessionContextValue>({
  user: null,
  role: DEFAULT_ROLE,
  isAdmin: false,
  isAuthenticated: false,
});

export function SessionProvider({ children, user }: { children: React.ReactNode; user: CurrentAdmin | null }) {
  const value = useMemo<SessionContextValue>(
    () => ({ user, role: user?.role ?? DEFAULT_ROLE, isAdmin: user?.role === "admin", isAuthenticated: user !== null }),
    [user],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}

/** Role and a permission predicate bound to it. */
export function useRole(): { role: Role; isAdmin: boolean; can: <R extends Resource>(resource: R, action: ActionOf<R>) => boolean } {
  const { role, isAdmin, isAuthenticated } = useContext(SessionContext);
  const can = useCallback(<R extends Resource>(resource: R, action: ActionOf<R>) => isAuthenticated && canRole(role, resource, action), [role, isAuthenticated]);
  return { role, isAdmin, can };
}

/** `true` when the signed-in operator may perform the action (anonymous → false). */
export function useCan<R extends Resource>(resource: R, action: ActionOf<R>): boolean {
  const { role, isAuthenticated } = useContext(SessionContext);
  return isAuthenticated && canRole(role, resource, action);
}
