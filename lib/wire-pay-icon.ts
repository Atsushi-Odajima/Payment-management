// Generates the Wire Pay brand icon as an SVG string.
// Layout: Σ-shape opening to the left (apex at globe center) connecting two
// nodes on the right side, plus a dashed orbit arc on the outer right.

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

  // Two nodes on the right side of the orbit (no left node — the Σ apex
  // visually replaces it). Positioned high/low at ±60° so the dashed
  // arc connecting them on the right bulges out noticeably.
  const trNode = arcPoint(-60); // top-right (upper-right diagonal)
  const brNode = arcPoint(60); // bottom-right (lower-right diagonal)
  const nodes = [trNode, brNode];

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
      )}" y2="${num(y0)}" stroke-width="${num(thinStroke * 0.7)}" opacity="0.6"/>`;
    })
    .join("");

  const longitudes = [-0.5, 0, 0.5]
    .map((ox) => {
      if (ox === 0) {
        return `<line x1="${num(r)}" y1="${num(r - globeR)}" x2="${num(
          r,
        )}" y2="${num(r + globeR)}" stroke-width="${num(
          thinStroke * 0.7,
        )}" opacity="0.6"/>`;
      }
      const ctrl = r + globeR * ox * 1.5;
      return `<path d="M ${num(r)} ${num(r - globeR)} Q ${num(ctrl)} ${num(
        r,
      )} ${num(r)} ${num(r + globeR)}" stroke-width="${num(
        thinStroke * 0.7,
      )}" opacity="0.6"/>`;
    })
    .join("");

  const equator = `<line x1="${num(r - globeR)}" y1="${num(r)}" x2="${num(
    r + globeR,
  )}" y2="${num(r)}" stroke-width="${num(
    thinStroke * 0.7,
  )}" opacity="0.6"/>`;

  const nodeCircles = nodes
    .map(
      (n) =>
        `<circle cx="${num(n.x)}" cy="${num(n.y)}" r="${num(
          nodeR,
        )}" stroke-width="${num(strokeW)}" fill="#0a0a0a"/>`,
    )
    .join("");

  // Σ-shape opening to the LEFT, apex at globe center. 4 segments:
  //   top horizontal bar (from top-right node westward to left corner)
  //   upper diagonal (left corner down-right to apex at globe center)
  //   lower diagonal (apex down-left to bottom-left corner)
  //   bottom horizontal bar (bottom-left corner eastward to bottom-right node)
  const sigmaCornerX = s * 0.08;
  const sigmaPath = `<path d="M ${num(trNode.x)} ${num(trNode.y)} L ${num(
    sigmaCornerX,
  )} ${num(trNode.y)} L ${num(r)} ${num(r)} L ${num(sigmaCornerX)} ${num(
    brNode.y,
  )} L ${num(brNode.x)} ${num(
    brNode.y,
  )}" stroke-width="${num(thinStroke)}" opacity="0.95"/>`;

  // Right dashed arc: from top-right node, around the outside (through 0°),
  // down to the bottom-right node. Spans ~120° of the orbit circle.
  const rightArc = `<path d="M ${num(trNode.x)} ${num(trNode.y)} A ${num(
    orbitR,
  )} ${num(orbitR)} 0 0 1 ${num(brNode.x)} ${num(
    brNode.y,
  )}" stroke-width="${num(thinStroke)}" opacity="0.55" stroke-dasharray="${num(
    s * 0.04,
  )} ${num(s * 0.02)}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <rect x="0" y="0" width="${s}" height="${s}" rx="${num(bgRadius)}" ry="${num(
    bgRadius,
  )}" fill="#0a0a0a"/>
  <g stroke="white" fill="none" stroke-linecap="round" stroke-linejoin="round">
    ${rightArc}
    <circle cx="${num(r)}" cy="${num(r)}" r="${num(
      globeR,
    )}" stroke-width="${num(strokeW)}"/>
    ${latitudes}
    ${equator}
    ${longitudes}
    ${sigmaPath}
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
