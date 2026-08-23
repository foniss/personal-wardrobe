// Dominant-colour extraction from raw RGBA pixels. Pure, client-safe.
//
// Strategy: garments sit centre-frame on some background. We find the
// background colour family from the image's border stripe, suppress
// buckets belonging to it, then rank the rest with a centre bias.
// If nearly everything central reads as "background" (e.g. an ecru
// shirt on cream linen), we assume the garment really is that colour
// and skip suppression.
import { rgbToHex, type RGB } from "./colors";

export interface ExtractedPalette {
  dominant: string;
  palette: string[];
}

interface Bucket {
  w: number; // centre-biased weight
  wc: number; // centre-only weight
  r: number;
  g: number;
  b: number;
}

function rgbDist(a: RGB, b: RGB): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

const BG_THRESHOLD = 34;
const MIN_BG_SHARE = 0.08;
const MIN_CENTER_SHARE = 0.15;

export function extractPaletteFromPixels(
  data: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): ExtractedPalette {
  const buckets = new Map<number, Bucket>();
  const borderBuckets = new Map<number, Bucket>();
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const maxD = Math.hypot(cx, cy) || 1;
  const total = width * height;
  const step = Math.max(1, Math.floor(Math.sqrt(total / 9000)));
  const bx = Math.max(2, Math.floor(width * 0.09));
  const by = Math.max(2, Math.floor(height * 0.09));

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const alpha = data[i + 3];
      if (alpha !== undefined && alpha < 200) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);

      // border stripe → plain count (background detection)
      if (x < bx || x > width - bx || y < by || y > height - by) {
        const bb = borderBuckets.get(key);
        if (bb) {
          bb.w += 1;
          bb.r += r;
          bb.g += g;
          bb.b += b;
        } else {
          borderBuckets.set(key, { w: 1, wc: 0, r, g, b });
        }
      }

      const d = Math.hypot(x - cx, y - cy) / maxD;
      const wgt = 1 + 2.4 * (1 - d);
      const isCenter =
        x >= width * 0.25 && x <= width * 0.75 && y >= height * 0.25 && y <= height * 0.75;
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.w += wgt;
        if (isCenter) bucket.wc += wgt;
        bucket.r += r * wgt;
        bucket.g += g * wgt;
        bucket.b += b * wgt;
      } else {
        buckets.set(key, { w: wgt, wc: isCenter ? wgt : 0, r: r * wgt, g: g * wgt, b: b * wgt });
      }
    }
  }

  const withAvg = [...buckets.values()].map((b) => ({
    ...b,
    rgb: { r: b.r / b.w, g: b.g / b.w, b: b.b / b.w } as RGB,
  }));
  if (withAvg.length === 0) return { dominant: "#1a1815", palette: ["#1a1815"] };

  // background colour = border mode
  const borderTop = [...borderBuckets.values()].sort((a, b) => b.w - a.w)[0];
  const bg: RGB | null = borderTop
    ? { r: borderTop.r / borderTop.w, g: borderTop.g / borderTop.w, b: borderTop.b / borderTop.w }
    : null;

  const totalW = withAvg.reduce((s, b) => s + b.w, 0);
  const totalWc = withAvg.reduce((s, b) => s + b.wc, 0);
  const kept = bg ? withAvg.filter((b) => rgbDist(b.rgb, bg) >= BG_THRESHOLD) : withAvg;
  const keptW = kept.reduce((s, b) => s + b.w, 0);
  const keptWc = kept.reduce((s, b) => s + b.wc, 0);

  const suppress =
    bg &&
    keptW / Math.max(totalW, 1) > MIN_BG_SHARE &&
    totalWc > 0 &&
    keptWc / totalWc > MIN_CENTER_SHARE;

  // Garments live centre-frame: rank by centre-region weight first.
  const source = (suppress ? kept : withAvg).sort(
    (a, b) => b.wc - a.wc || b.w - a.w,
  );

  const picked: Array<{ hex: string; rgb: RGB }> = [];
  for (const bucket of source) {
    if (picked.some((p) => rgbDist(p.rgb, bucket.rgb) < 34)) continue;
    picked.push({ hex: rgbToHex(bucket.rgb), rgb: bucket.rgb });
    if (picked.length >= 5) break;
  }

  return { dominant: picked[0].hex, palette: picked.map((p) => p.hex) };
}
