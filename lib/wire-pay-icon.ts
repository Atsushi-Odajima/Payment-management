// Wire Pay brand icon — single source of truth for the geometry.
//
// `iconGeometry(size)` returns plain numbers/paths; `buildWirePayIconSvg`
// serializes them to an SVG string (used by scripts/build-icons.mts to
// rasterize favicons) and components/wire-pay-icon.tsx renders the same
// geometry as static JSX. Change the shape here and both outputs follow.

export interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface IconGeometry {
  size: number;
  bgRadius: number;
  strokes: { thin: number; thick: number; grid: number };
  orbit: {
    topToLeft: string;
    leftToBot: string;
    topToBotRight: string;
    dash: [number, number];
  };
  wires: Line[];
  globe: { cx: number; cy: number; r: number };
  latitudes: Line[];
  equator: Line;
  longitudeShapes: Array<{ kind: "line"; line: Line } | { kind: "path"; d: string }>;
  nodes: { cx: number; cy: number; r: number }[];
}

const num = (n: number) => Number(n.toFixed(3));

export function iconGeometry(size = 1024, rounded = true): IconGeometry {
  const s = size;
  const r = s / 2;
  const globeR = s * 0.28;
  const orbitR = s * 0.42;
  const nodeR = s * 0.038;
  const strokeW = s * 0.018;
  const thinStroke = s * 0.012;
  const bgRadius = rounded ? s * 0.22 : 0;

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const arcPoint = (deg: number) => ({
    x: num(r + orbitR * Math.cos(toRad(deg))),
    y: num(r + orbitR * Math.sin(toRad(deg))),
  });
  const topPt = arcPoint(-90);
  const leftPt = arcPoint(180);
  const botPt = arcPoint(90);
  const nodePts = [topPt, leftPt, botPt];

  const latitudes: Line[] = [-0.55, -0.25, 0.25, 0.55].map((frac) => {
    const y0 = num(r + globeR * frac);
    const halfW = Math.sqrt(Math.max(0, globeR * globeR - (globeR * frac) ** 2));
    return { x1: num(r - halfW), y1: y0, x2: num(r + halfW), y2: y0 };
  });

  const longitudeShapes: IconGeometry["longitudeShapes"] = [-0.5, 0, 0.5].map((ox) => {
    if (ox === 0) {
      return {
        kind: "line" as const,
        line: { x1: num(r), y1: num(r - globeR), x2: num(r), y2: num(r + globeR) },
      };
    }
    const ctrl = num(r + globeR * ox * 1.5);
    return {
      kind: "path" as const,
      d: `M ${num(r)} ${num(r - globeR)} Q ${ctrl} ${num(r)} ${num(r)} ${num(r + globeR)}`,
    };
  });

  return {
    size: s,
    bgRadius: num(bgRadius),
    strokes: { thin: num(thinStroke), thick: num(strokeW), grid: num(thinStroke * 0.7) },
    orbit: {
      topToLeft: `M ${topPt.x} ${topPt.y} A ${num(orbitR)} ${num(orbitR)} 0 0 0 ${leftPt.x} ${leftPt.y}`,
      leftToBot: `M ${leftPt.x} ${leftPt.y} A ${num(orbitR)} ${num(orbitR)} 0 0 0 ${botPt.x} ${botPt.y}`,
      topToBotRight: `M ${topPt.x} ${topPt.y} A ${num(orbitR)} ${num(orbitR)} 0 0 1 ${botPt.x} ${botPt.y}`,
      dash: [num(s * 0.04), num(s * 0.02)],
    },
    wires: nodePts.map((n) => ({ x1: num(r), y1: num(r), x2: n.x, y2: n.y })),
    globe: { cx: num(r), cy: num(r), r: num(globeR) },
    latitudes,
    equator: { x1: num(r - globeR), y1: num(r), x2: num(r + globeR), y2: num(r) },
    longitudeShapes,
    nodes: nodePts.map((n) => ({ cx: n.x, cy: n.y, r: num(nodeR) })),
  };
}

export interface BuildIconOptions {
  size?: number;
  rounded?: boolean;
}

export function buildWirePayIconSvg({ size = 1024, rounded = true }: BuildIconOptions = {}): string {
  const g = iconGeometry(size, rounded);
  const line = (l: Line, w: number, opacity: string) =>
    `<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" stroke-width="${w}" opacity="${opacity}"/>`;
  const longitudes = g.longitudeShapes
    .map((sh) =>
      sh.kind === "line"
        ? line(sh.line, g.strokes.grid, "0.7")
        : `<path d="${sh.d}" stroke-width="${g.strokes.grid}" opacity="0.7"/>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${g.size}" height="${g.size}" viewBox="0 0 ${g.size} ${g.size}">
  <rect x="0" y="0" width="${g.size}" height="${g.size}" rx="${g.bgRadius}" ry="${g.bgRadius}" fill="#0a0a0a"/>
  <g stroke="white" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="${g.orbit.topToLeft}" stroke-width="${g.strokes.thin}" opacity="0.85"/>
    <path d="${g.orbit.leftToBot}" stroke-width="${g.strokes.thin}" opacity="0.85"/>
    <path d="${g.orbit.topToBotRight}" stroke-width="${g.strokes.thin}" opacity="0.6" stroke-dasharray="${g.orbit.dash[0]} ${g.orbit.dash[1]}"/>
    ${g.wires.map((w) => line(w, g.strokes.thin, "0.5")).join("")}
    <circle cx="${g.globe.cx}" cy="${g.globe.cy}" r="${g.globe.r}" stroke-width="${g.strokes.thick}"/>
    ${g.latitudes.map((l) => line(l, g.strokes.grid, "0.7")).join("")}
    ${line(g.equator, g.strokes.grid, "0.7")}
    ${longitudes}
    ${g.nodes.map((n) => `<circle cx="${n.cx}" cy="${n.cy}" r="${n.r}" stroke-width="${g.strokes.thick}" fill="#0a0a0a"/>`).join("")}
  </g>
</svg>`;
}
