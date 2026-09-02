import { cn } from "@/lib/utils";

export type BadgeVariant = "neutral" | "info" | "success" | "warning" | "danger" | "muted" | "violet";

const VARIANT_CLASS: Record<BadgeVariant, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  info: "bg-blue-100 text-blue-800 ring-blue-200",
  success: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  warning: "bg-amber-100 text-amber-800 ring-amber-200",
  danger: "bg-rose-100 text-rose-800 ring-rose-200",
  muted: "bg-slate-200 text-slate-700 ring-slate-300",
  violet: "bg-violet-100 text-violet-800 ring-violet-200",
};

export function Badge({
  variant = "neutral",
  className,
  children,
}: {
  variant?: BadgeVariant;
  className?: string;
  children: React.ReactNode;
}) {
  return <span className={cn("badge", VARIANT_CLASS[variant], className)}>{children}</span>;
}
