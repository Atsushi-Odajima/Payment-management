"use client";

// Demo operator role (master / general). Persisted in a cookie so API routes
// can enforce it server-side, mirrored to localStorage like the language.

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { DEFAULT_ROLE, ROLE_COOKIE } from "@/lib/role";
import type { Role } from "@/lib/merchants/types";

interface RoleContextValue {
  role: Role;
  setRole: (role: Role) => void;
  isMaster: boolean;
}

const RoleContext = createContext<RoleContextValue>({
  role: DEFAULT_ROLE,
  setRole: () => {},
  isMaster: false,
});

export function RoleProvider({ children, initialRole }: { children: React.ReactNode; initialRole: Role }) {
  const [role, setRoleState] = useState<Role>(initialRole);
  const setRole = useCallback((next: Role) => {
    setRoleState(next);
    document.cookie = `${ROLE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
    try {
      localStorage.setItem(ROLE_COOKIE, next);
    } catch {
      // best-effort
    }
  }, []);
  const value = useMemo(() => ({ role, setRole, isMaster: role === "master" }), [role, setRole]);
  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole(): RoleContextValue {
  return useContext(RoleContext);
}
