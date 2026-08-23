// ------------------------------------------------------------------
// Color science for the harmony engine. Pure functions, client-safe.
// ------------------------------------------------------------------

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface HSL {
  h: number; // 0..360
  s: number; // 0..1
  l: number; // 0..1
}

export function hexToRgb(hex: string): RGB {
  let h = hex.replace("#", "").trim();
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  const n = parseInt(h.slice(0, 6), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: RGB): string {
  const c = (v: number) =>
    Math.round(Math.max(0, Math.min(255, v)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function rgbToHsl({ r, g, b }: RGB): HSL {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h * 60, s, l };
}

export function hslOfHex(hex: string): HSL {
  return rgbToHsl(hexToRgb(hex));
}

export function isNeutralHex(hex: string): boolean {
  const { s, l } = hslOfHex(hex);
  return s < 0.16 || l < 0.1 || l > 0.93;
}

export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export function hueDistanceHex(aHex: string, bHex: string): number {
  return hueDistance(hslOfHex(aHex).h, hslOfHex(bHex).h);
}

// ------------------------- perceptual naming -------------------------

interface LAB {
  l: number;
  a: number;
  b: number;
}

function pivotRgb(n: number): number {
  const v = n / 255;
  return v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92;
}

export function rgbToLab({ r, g, b }: RGB): LAB {
  const R = pivotRgb(r);
  const G = pivotRgb(g);
  const B = pivotRgb(b);
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

function deltaE(a: LAB, b: LAB): number {
  return Math.sqrt((a.l - b.l) ** 2 + (a.a - b.a) ** 2 + (a.b - b.b) ** 2);
}

const NAMED: ReadonlyArray<readonly [string, string]> = [
  ["Jet black", "#14120f"],
  ["Charcoal", "#35322d"],
  ["Graphite", "#4d4a44"],
  ["Stone grey", "#8b8880"],
  ["Cloud grey", "#c8c5bc"],
  ["Ivory", "#f2ede1"],
  ["Pure white", "#fafaf8"],
  ["Ecru", "#e0d6bf"],
  ["Sand", "#cbae87"],
  ["Camel", "#b28a5a"],
  ["Chocolate", "#5c3a24"],
  ["Espresso", "#38271b"],
  ["Burgundy", "#571f24"],
  ["Oxblood", "#472229"],
  ["Crimson", "#a02c30"],
  ["Russet", "#7a3016"],
  ["Rust", "#b2552b"],
  ["Terracotta", "#c96f4a"],
  ["Burnt orange", "#cc6a25"],
  ["Mustard", "#d6a231"],
  ["Butter yellow", "#e8cf7d"],
  ["Blush pink", "#e2b8ad"],
  ["Dusty rose", "#c48f95"],
  ["Plum", "#5b3348"],
  ["Lavender", "#b3a9c4"],
  ["Navy", "#1f2a44"],
  ["Indigo", "#2e4070"],
  ["Denim blue", "#3f6188"],
  ["Steel blue", "#6d87a3"],
  ["Sky blue", "#a7bfd4"],
  ["Teal", "#28524f"],
  ["Forest green", "#2f4a34"],
  ["Olive", "#6a6a3d"],
  ["Sage", "#9da98d"],
];

export function nearestColorName(hex: string): string {
  const lab = rgbToLab(hexToRgb(hex));
  let best = "Ink";
  let bestD = Infinity;
  for (const [name, h] of NAMED) {
    const d = deltaE(lab, rgbToLab(hexToRgb(h)));
    if (d < bestD) {
      bestD = d;
      best = name;
    }
  }
  return best;
}

// ------------------------- harmony mathematics -----------------------

export function harmonyScore(aHex: string, bHex: string): number {
  const A = hslOfHex(aHex);
  const B = hslOfHex(bHex);
  const nA = isNeutralHex(aHex);
  const nB = isNeutralHex(bHex);
  const contrast = Math.abs(A.l - B.l);
  let base: number;

  if (nA && nB) {
    base = 86 + contrast * 12;
  } else if (nA || nB) {
    const colored = nA ? B : A;
    base = 78 + contrast * 14 + (colored.s > 0.5 ? 3 : 0);
  } else {
    const d = hueDistance(A.h, B.h);
    if (d < 18) base = contrast > 0.14 ? 94 : 88;
    else if (d < 40) base = 84;
    else if (d < 62) base = 66;
    else if (d < 95) base = 56;
    else if (d < 125) base = 68;
    else if (d < 152) base = 78;
    else base = 92;
    if (A.s > 0.55 && B.s > 0.55 && d >= 40 && d <= 150) base -= 8;
    base += Math.min(6, contrast * 10);
  }

  return Math.round(Math.max(5, Math.min(99, base)));
}

export function relationName(aHex: string, bHex: string): string {
  const nA = isNeutralHex(aHex);
  const nB = isNeutralHex(bHex);
  if (nA && nB) return "Neutral ground";
  if (nA || nB) return "Anchored neutral";
  const d = hueDistanceHex(aHex, bHex);
  if (d < 18) return "Tonal";
  if (d < 40) return "Analogous";
  if (d < 62) return "Kindred";
  if (d < 95) return "High tension";
  if (d < 125) return "Contrast play";
  if (d < 152) return "Triadic";
  return "Complementary";
}

export function relationVerdict(score: number): string {
  if (score >= 90) return "A natural pair — wear it without thinking.";
  if (score >= 80) return "Strong pairing. Quietly confident.";
  if (score >= 70) return "Works — keep the rest of the fit calm.";
  if (score >= 55) return "Risky tension. Intentional or accidental?";
  return "Clash territory. Proceed with swagger.";
}

export function contrastText(hex: string): string {
  return hslOfHex(hex).l > 0.6 ? "#17140e" : "#f5f1e8";
}
