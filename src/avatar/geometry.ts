// ------------------------------------------------------------------
// Figure geometry: derives all landmark coordinates for the avatar
// from character params. Height shifts leg-to-torso ratio, build and
// optional weight shift widths. Nothing here judges appearance —
// purely proportional layout for the renderer.
// ------------------------------------------------------------------

import { hexToRgb, rgbToHex } from "@/lib/colors";
import type { Build, CharacterParams } from "./params";

export const VIEW_W = 320;
export const VIEW_H = 560;

export interface FigureGeometry {
  cx: number;
  head: { cx: number; cy: number; rx: number; ry: number };
  neck: { w: number; y: number; h: number };
  shoulderY: number;
  shoulderHalf: number;
  waistY: number;
  waistHalf: number;
  hipY: number;
  hipHalf: number;
  elbowY: number;
  wristY: number;
  armThick: number;
  hipDropY: number; // crotch level
  kneeY: number;
  ankleY: number;
  legThick: number;
  groundY: number;
  // derived joint positions
  shoulder: { lx: number; rx: number; y: number };
  elbow: { lx: number; rx: number; y: number };
  wrist: { lx: number; rx: number; y: number };
  legX: { l: number; r: number };
}

// width multipliers per build preset
const SHOULDER_W: Record<Build, number> = { slim: 0.9, average: 1, broad: 1.13 };
const WAIST_W: Record<Build, number> = { slim: 0.88, average: 1, broad: 1.16 };
const HIP_W: Record<Build, number> = { slim: 0.92, average: 1, broad: 1.1 };
const LIMB_W: Record<Build, number> = { slim: 0.85, average: 1, broad: 1.15 };

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function figureGeometry(p: CharacterParams): FigureGeometry {
  const female = p.gender === "female";
  const cx = VIEW_W / 2;

  // height primarily lengthens the leg line relative to the torso
  const legRatio = clamp(0.47 + (p.heightCm - 168) * 0.0007, 0.44, 0.5);

  // weight — optional, gently nudges mid-body widths only
  const refWeight = female ? 62 : 76;
  const wm = p.weightKg
    ? clamp((p.weightKg - refWeight) / refWeight, -1, 1) * 0.1
    : 0;

  const shoulderHalf = (female ? 46 : 53) * SHOULDER_W[p.build];
  const waistHalf = (female ? 29 : 33) * WAIST_W[p.build] * (1 + wm);
  const hipHalf = (female ? 42 : 34) * HIP_W[p.build] * (1 + wm * 0.8);
  const armThick = 15 * LIMB_W[p.build];
  const legThick = 17 * LIMB_W[p.build] * (1 + wm * 0.5);

  const shoulderY = 170;
  const waistY = 252;
  const hipY = 298;
  const ankleY = 452 + legRatio * 34;
  const hipDropY = hipY + 8;
  const kneeY = hipY + (ankleY - hipY) * 0.52;
  const groundY = ankleY + 26;

  const legXL = cx - hipHalf * 0.42;
  const legXR = cx + hipHalf * 0.42;

  return {
    cx,
    head: { cx, cy: 94, rx: 33, ry: 39 },
    neck: { w: female ? 23 : 27, y: 126, h: 30 },
    shoulderY,
    shoulderHalf,
    waistY,
    waistHalf,
    hipY,
    hipHalf,
    elbowY: 268,
    wristY: 352,
    armThick,
    hipDropY,
    kneeY,
    ankleY,
    legThick,
    groundY,
    shoulder: { lx: cx - shoulderHalf, rx: cx + shoulderHalf, y: shoulderY },
    elbow: { lx: cx - shoulderHalf - 5, rx: cx + shoulderHalf + 5, y: 268 },
    wrist: { lx: cx - hipHalf - 15, rx: cx + hipHalf + 15, y: 352 },
    legX: { l: legXL, r: legXR },
  };
}

// ------------------------- shading helpers ---------------------------

/** Darken (amt < 0) or lighten (amt > 0) a hex colour, −100..100. */
export function shadeHex(hex: string, amt: number): string {
  const { r, g, b } = hexToRgb(hex);
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt) / 100;
  return rgbToHex({
    r: r + (t - r) * p,
    g: g + (t - g) * p,
    b: b + (t - b) * p,
  });
}
