// Inline brand icon rendered as static JSX from the shared geometry
// (lib/wire-pay-icon.ts). Fixed 100×100 viewBox so CSS scales it.

import { iconGeometry } from "@/lib/wire-pay-icon";

interface Props {
  className?: string;
  /** Accessible name. Omit (aria-hidden) when adjacent text already names it. */
  title?: string;
  rounded?: boolean;
}

const G = iconGeometry(100, true);
const G_SQUARE = iconGeometry(100, false);

export function WirePayIcon({ className, title, rounded = true }: Props) {
  const g = rounded ? G : G_SQUARE;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <rect x="0" y="0" width="100" height="100" rx={g.bgRadius} ry={g.bgRadius} fill="#0a0a0a" />
      <g stroke="white" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d={g.orbit.topToLeft} strokeWidth={g.strokes.thin} opacity="0.85" />
        <path d={g.orbit.leftToBot} strokeWidth={g.strokes.thin} opacity="0.85" />
        <path
          d={g.orbit.topToBotRight}
          strokeWidth={g.strokes.thin}
          opacity="0.6"
          strokeDasharray={`${g.orbit.dash[0]} ${g.orbit.dash[1]}`}
        />
        {g.wires.map((w, i) => (
          <line key={`w${i}`} {...w} strokeWidth={g.strokes.thin} opacity="0.5" />
        ))}
        <circle cx={g.globe.cx} cy={g.globe.cy} r={g.globe.r} strokeWidth={g.strokes.thick} />
        {g.latitudes.map((l, i) => (
          <line key={`la${i}`} {...l} strokeWidth={g.strokes.grid} opacity="0.7" />
        ))}
        <line {...g.equator} strokeWidth={g.strokes.grid} opacity="0.7" />
        {g.longitudeShapes.map((sh, i) =>
          sh.kind === "line" ? (
            <line key={`lo${i}`} {...sh.line} strokeWidth={g.strokes.grid} opacity="0.7" />
          ) : (
            <path key={`lo${i}`} d={sh.d} strokeWidth={g.strokes.grid} opacity="0.7" />
          ),
        )}
        {g.nodes.map((n, i) => (
          <circle key={`n${i}`} cx={n.cx} cy={n.cy} r={n.r} strokeWidth={g.strokes.thick} fill="#0a0a0a" />
        ))}
      </g>
    </svg>
  );
}
