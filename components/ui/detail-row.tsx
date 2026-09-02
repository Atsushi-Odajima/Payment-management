import { cn } from "@/lib/utils";

/** Label / value pair used on detail screens. */
export function DetailRow({
  label,
  children,
  compact = false,
}: {
  label: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-500">{label}</span>
        <span>{children}</span>
      </div>
    );
  }
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-4 px-5 py-3 text-sm")}>
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
      <span className="text-right text-slate-800">{children}</span>
    </div>
  );
}
