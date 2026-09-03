"use client";

// Small inline-SVG charts for the reports screen (no charting library):
// a line chart for the time series, a donut for the method share and a
// horizontal bar chart for the merchant ranking. Colours come from a fixed
// brand-neutral palette; every mark also carries its value as text so the
// charts read without colour.

import { cn } from "@/lib/utils";

export const CHART_COLORS = ["#2667e6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#0ea5e9", "#64748b"] as const;

export interface LinePoint {
  label: string;
  values: number[];
}

export function LineChart({ points, series, formatValue, height = 220 }: { points: LinePoint[]; series: { name: string; color: string }[]; formatValue: (v: number) => string; height?: number }) {
  const width = 720;
  const pad = { top: 16, right: 16, bottom: 36, left: 56 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(1, ...points.flatMap((p) => p.values));
  const x = (i: number) => pad.left + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
  const labelEvery = Math.max(1, Math.ceil(points.length / 8));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={series.map((s) => s.name).join(", ")}>
      {ticks.map((tv) => (
        <g key={tv}>
          <line x1={pad.left} x2={width - pad.right} y1={y(tv)} y2={y(tv)} stroke="#e2e8f0" strokeWidth={1} />
          <text x={pad.left - 8} y={y(tv) + 4} textAnchor="end" fontSize={10} fill="#64748b">
            {formatValue(tv)}
          </text>
        </g>
      ))}
      {points.map((p, i) =>
        i % labelEvery === 0 ? (
          <text key={p.label} x={x(i)} y={height - pad.bottom + 16} textAnchor="middle" fontSize={10} fill="#64748b">
            {p.label}
          </text>
        ) : null,
      )}
      {series.map((s, si) => {
        const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.values[si] ?? 0).toFixed(1)}`).join(" ");
        return (
          <g key={s.name}>
            <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {points.map((p, i) => (
              <circle key={i} cx={x(i)} cy={y(p.values[si] ?? 0)} r={3} fill={s.color}>
                <title>{`${p.label} · ${s.name}: ${formatValue(p.values[si] ?? 0)}`}</title>
              </circle>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

export function DonutChart({ slices, formatValue, size = 200 }: { slices: { label: string; value: number; color: string }[]; formatValue: (v: number) => string; size?: number }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = size / 2 - 8;
  const c = size / 2;
  let angle = -Math.PI / 2;
  const paths = slices.map((s) => {
    const share = total > 0 ? s.value / total : 0;
    const start = angle;
    const end = angle + share * Math.PI * 2;
    angle = end;
    const large = end - start > Math.PI ? 1 : 0;
    const p1 = [c + r * Math.cos(start), c + r * Math.sin(start)];
    const p2 = [c + r * Math.cos(end), c + r * Math.sin(end)];
    const d = share >= 0.9999 ? `M${c - r},${c} a${r},${r} 0 1,0 ${r * 2},0 a${r},${r} 0 1,0 -${r * 2},0` : `M${c},${c} L${p1[0]},${p1[1]} A${r},${r} 0 ${large},1 ${p2[0]},${p2[1]} Z`;
    return { ...s, d, share };
  });
  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={slices.map((s) => s.label).join(", ")}>
        {paths.map((p) => (
          <path key={p.label} d={p.d} fill={p.color} stroke="#fff" strokeWidth={2}>
            <title>{`${p.label}: ${formatValue(p.value)} (${Math.round(p.share * 100)}%)`}</title>
          </path>
        ))}
        <circle cx={c} cy={c} r={r * 0.55} fill="#fff" />
        <text x={c} y={c + 4} textAnchor="middle" fontSize={12} fill="#334155">
          {formatValue(total)}
        </text>
      </svg>
      <ul className="space-y-1 text-xs text-slate-700">
        {paths.map((p) => (
          <li key={p.label} className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: p.color }} aria-hidden />
            <span className="w-28">{p.label}</span>
            <span className="tabular-nums">{formatValue(p.value)}</span>
            <span className="text-slate-400">({Math.round(p.share * 100)}%)</span>
          </li>
        ))}
        {paths.length === 0 && <li className="text-slate-400">—</li>}
      </ul>
    </div>
  );
}

export function BarChart({ bars, formatValue, className }: { bars: { label: string; value: number; sub?: string }[]; formatValue: (v: number) => string; className?: string }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <ol className={cn("space-y-2", className)}>
      {bars.map((b, i) => (
        <li key={b.label} className="text-xs">
          <div className="flex items-center justify-between text-slate-700">
            <span className="truncate">
              <span className="mr-2 text-slate-400">{i + 1}.</span>
              {b.label}
              {b.sub && <span className="ml-1 text-slate-400">{b.sub}</span>}
            </span>
            <span className="tabular-nums">{formatValue(b.value)}</span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${b.label}: ${formatValue(b.value)}`}>
            <div className="h-full rounded-full" style={{ width: `${(b.value / max) * 100}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
          </div>
        </li>
      ))}
      {bars.length === 0 && <li className="text-xs text-slate-400">—</li>}
    </ol>
  );
}
