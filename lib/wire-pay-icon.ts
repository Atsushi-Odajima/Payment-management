// Generates the Wire Pay brand icon as an SVG string.
// Port of components/wire-pay-icon.tsx (which renders the same shape via JSX)
// so we can serialize it to disk for PNG conversion at build time.

export interface BuildIconOptions {
  size?: number;
  rounded?: boolean;
}

export function buildWirePayIconSvg({
  size = 1024,
  rounded = true,
}: BuildIconOptions = {}): string {
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
    x: r + orbitR * Math.cos(toRad(deg)),
    y: r + orbitR * Math.sin(toRad(deg)),
  });

  const topPt = arcPoint(-90);
  const leftPt = arcPoint(180);
  const botPt = arcPoint(90);
  const nodes = [topPt, leftPt, botPt];

  const euroFontSize = globeR * 0.85;
  const euroY = r + euroFontSize * 0.35;

  const latitudes = [-0.55, -0.25, 0.25, 0.55]
    .map((frac) => {
      const y0 = r + globeR * frac;
      const halfW = Math.sqrt(
        Math.max(0, globeR * globeR - (globeR * frac) ** 2),
      );
      return `<line x1="${num(r - halfW)}" y1="${num(y0)}" x2="${num(
        r + halfW,
      )}" y2="${num(y0)}" stroke-width="${num(thinStroke * 0.7)}" opacity="0.7"/>`;
    })
    .join("");

  const longitudes = [-0.5, 0, 0.5]
    .map((ox) => {
      if (ox === 0) {
        return `<line x1="${num(r)}" y1="${num(r - globeR)}" x2="${num(
          r,
        )}" y2="${num(r + globeR)}" stroke-width="${num(
          thinStroke * 0.7,
        )}" opacity="0.7"/>`;
      }
      const ctrl = r + globeR * ox * 1.5;
      return `<path d="M ${num(r)} ${num(r - globeR)} Q ${num(ctrl)} ${num(
        r,
      )} ${num(r)} ${num(r + globeR)}" stroke-width="${num(
        thinStroke * 0.7,
      )}" opacity="0.7"/>`;
    })
    .join("");

  const wireLines = nodes
    .map(
      (n) =>
        `<line x1="${num(r)}" y1="${num(r)}" x2="${num(n.x)}" y2="${num(
          n.y,
        )}" stroke-width="${num(thinStroke)}" opacity="0.5"/>`,
    )
    .join("");

  const nodeCircles = nodes
    .map(
      (n) =>
        `<circle cx="${num(n.x)}" cy="${num(n.y)}" r="${num(
          nodeR,
        )}" stroke-width="${num(strokeW)}" fill="#0a0a0a"/>`,
    )
    .join("");

  // Σ-shape on the left connecting top → left → bottom.
  // 4 segments: top horizontal bar, upper diagonal, lower diagonal, bottom
  // horizontal bar. The left node sits at the tip/apex of the Σ.
  const sigmaCornerX = r - orbitR * 0.5;
  const sigmaPath = `<path d="M ${num(topPt.x)} ${num(topPt.y)} L ${num(
    sigmaCornerX,
  )} ${num(topPt.y)} L ${num(leftPt.x)} ${num(leftPt.y)} L ${num(
    sigmaCornerX,
  )} ${num(botPt.y)} L ${num(botPt.x)} ${num(
    botPt.y,
  )}" stroke-width="${num(thinStroke)}" opacity="0.85"/>`;

  const topToBotRight = `<path d="M ${num(topPt.x)} ${num(topPt.y)} A ${num(
    orbitR,
  )} ${num(orbitR)} 0 0 1 ${num(botPt.x)} ${num(
    botPt.y,
  )}" stroke-width="${num(thinStroke)}" opacity="0.6" stroke-dasharray="${num(
    s * 0.04,
  )} ${num(s * 0.02)}"/>`;

  const equator = `<line x1="${num(r - globeR)}" y1="${num(r)}" x2="${num(
    r + globeR,
  )}" y2="${num(r)}" stroke-width="${num(
    thinStroke * 0.7,
  )}" opacity="0.7"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <rect x="0" y="0" width="${s}" height="${s}" rx="${num(bgRadius)}" ry="${num(
    bgRadius,
  )}" fill="#0a0a0a"/>
  <g stroke="white" fill="none" stroke-linecap="round" stroke-linejoin="round">
    ${sigmaPath}
    ${topToBotRight}
    ${wireLines}
    <circle cx="${num(r)}" cy="${num(r)}" r="${num(
      globeR,
    )}" stroke-width="${num(strokeW)}"/>
    ${latitudes}
    ${equator}
    ${longitudes}
    ${nodeCircles}
  </g>
  <text x="${num(r)}" y="${num(
    euroY,
  )}" text-anchor="middle" fill="white" font-size="${num(
    euroFontSize,
  )}" font-family="Georgia, 'Times New Roman', serif" font-weight="300" opacity="0.95">€</text>
</svg>`;
}

function num(n: number): string {
  return Number(n.toFixed(3)).toString();
}
