// Truffle mark — organic ring cross-section rendered as inline SVG.
// Deterministic: fixed seed 9021 always produces the same geometry.

function mulberry32(a: number) {
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function ringPath(
  cx: number,
  cy: number,
  baseR: number,
  seed: number,
  irregularity: number,
  harmonics: number,
  points = 128,
): string {
  const rng = mulberry32(seed);
  const comps: { freq: number; amp: number; phase: number }[] = [];
  for (let k = 0; k < harmonics; k++) {
    comps.push({
      freq: 2 + Math.floor(rng() * 5) + k,
      amp: ((0.4 + rng() * 0.7) * irregularity * baseR) / (k * 0.7 + 1),
      phase: rng() * Math.PI * 2,
    });
  }
  const pts: [number, number][] = [];
  for (let i = 0; i < points; i++) {
    const theta = (i / points) * Math.PI * 2;
    let r = baseR;
    for (const c of comps) r += c.amp * Math.sin(c.freq * theta + c.phase);
    pts.push([cx + Math.cos(theta) * r, cy + Math.sin(theta) * r]);
  }
  const p0x = (i: number) => pts[(i + points) % points]![0];
  const p0y = (i: number) => pts[(i + points) % points]![1];
  let d = `M ${p0x(0).toFixed(2)} ${p0y(0).toFixed(2)}`;
  for (let i = 0; i < points; i++) {
    const c1x = p0x(i) + (p0x(i + 1) - p0x(i - 1)) / 6;
    const c1y = p0y(i) + (p0y(i + 1) - p0y(i - 1)) / 6;
    const c2x = p0x(i + 1) - (p0x(i + 2) - p0x(i)) / 6;
    const c2y = p0y(i + 1) - (p0y(i + 2) - p0y(i)) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p0x(i + 1).toFixed(2)} ${p0y(i + 1).toFixed(2)}`;
  }
  return d + " Z";
}

// squircle body: bodyRound=100 → k=0.75 → c=43
const BODY =
  "M24 100 C24 43 43 24 100 24 C157 24 176 43 176 100 C176 157 157 176 100 176 C43 176 24 157 24 100 Z";

interface TruffleMarkProps {
  /** Rendered size in px */
  size?: number;
  /** Mark body fill */
  markColor?: string;
  /** Ring stroke color */
  ringColor?: string;
  /** Core dot fill */
  coreColor?: string;
  /** Use small variant (3 rings, 1 harmonic) — for nav/favicon sizes */
  small?: boolean;
  className?: string;
}

export function TruffleMark({
  size = 28,
  markColor = "#2C1A0E",
  ringColor = "#F5E9D3",
  coreColor = "#C9A86A",
  small = false,
  className,
}: TruffleMarkProps) {
  const ringCount = small ? 3 : (7 as number);
  const harmonics = small ? 1 : 3;
  const irregularity = small ? 0.2 : 0.28;
  const ringInnerR = 10;
  const ringMaxR = 70;
  const coreR = 8;

  const rings: { d: string; stroke: number }[] = [];
  for (let i = 0; i < ringCount; i++) {
    const u = ringCount === 1 ? 0 : i / (ringCount - 1);
    const r = ringInnerR + (ringMaxR - ringInnerR) * u;
    const irreg = irregularity * (0.55 + u * 0.75);
    // Stroke: interpolate 5→2 viewBox units (full) or fixed 9 (small — visible at nav size)
    const stroke = small ? 9 : 5 - 3 * u;
    rings.push({
      d: ringPath(100, 100, r, 9021 + i * 1009, irreg, harmonics),
      stroke,
    });
  }

  return (
    <svg viewBox="0 0 200 200" width={size} height={size} className={className} aria-hidden="true">
      <path d={BODY} fill={markColor} />
      {rings.map((ring, i) => (
        <path
          key={i}
          d={ring.d}
          fill="none"
          stroke={ringColor}
          strokeWidth={ring.stroke}
          strokeLinejoin="round"
        />
      ))}
      <circle cx={100} cy={100} r={coreR} fill={coreColor} />
    </svg>
  );
}
