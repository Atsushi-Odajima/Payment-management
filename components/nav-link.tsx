"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function NavLink({
  href,
  exact = false,
  className,
  activeClassName,
  inactiveClassName,
  children,
}: {
  href: string;
  exact?: boolean;
  className?: string;
  activeClassName?: string;
  inactiveClassName?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname() || "/";
  const active = exact
    ? pathname === href
    : pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        className ?? "flex items-center gap-2 rounded-lg px-3 py-2 transition",
        active
          ? activeClassName ?? "bg-brand-50 text-brand-700"
          : inactiveClassName ?? "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
      )}
    >
      {children}
    </Link>
  );
}
