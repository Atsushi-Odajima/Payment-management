"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

export interface SegmentOption<V extends string> {
  value: V;
  label: string;
  /** Tailwind classes for the selected state (default: brand). */
  activeClass?: string;
}

/**
 * Two-or-more-way toggle with an explicit selected state that does not rely
 * on hue alone (ring + weight + check mark) and proper aria-pressed.
 */
export function SegmentedControl<V extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: V;
  options: SegmentOption<V>[];
  onChange: (v: V) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div>
      <span id={id} className="label">
        {label}
      </span>
      <div
        role="group"
        aria-labelledby={id}
        className="flex overflow-hidden rounded-lg border border-slate-300 bg-white text-sm"
      >
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onChange(o.value)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 px-3 py-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300",
                active
                  ? cn("font-semibold ring-2 ring-inset", o.activeClass ?? "bg-brand-50 text-brand-800 ring-brand-400")
                  : "text-slate-600 hover:bg-slate-50",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              {active && (
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 8.5l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
