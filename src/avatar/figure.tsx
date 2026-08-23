// ------------------------------------------------------------------
// Human figure layers: backdrop, skin, face, hair, beard, glasses.
// Each layer is memoized so a single option change only repaints
// the layer it affects.
// ------------------------------------------------------------------

import { memo } from "react";
import { shadeHex, type FigureGeometry, VIEW_H, VIEW_W } from "./geometry";

export const INK = "#221c16";
export const BASE_TONE = "#d8cdbb";

// ------------------------------------------------------------------

export const BackdropLayer = memo(function BackdropLayer() {
  return (
    <g>
      <rect x={0} y={0} width={VIEW_W} height={VIEW_H} fill="#faf7f0" />
      <ellipse cx={160} cy={298} rx={150} ry={214} fill="#e8e2d3" opacity={0.55} />
    </g>
  );
});

// ------------------------------------------------------------------

interface SkinProps {
  g: FigureGeometry;
  skin: string;
}

export const SkinLayer = memo(function SkinLayer({ g, skin }: SkinProps) {
  const { cx, head, neck } = g;
  const skinShade = shadeHex(skin, -13);

  const legPath = (x: number) =>
    `M ${x} ${g.hipDropY + 2} ` +
    `L ${x} ${g.kneeY} L ${x} ${g.ankleY}`;

  const armPath = (side: "l" | "r") =>
    `M ${side === "l" ? g.shoulder.lx : g.shoulder.rx} ${g.shoulder.y + 8} ` +
    `L ${side === "l" ? g.elbow.lx : g.elbow.rx} ${g.elbow.y} ` +
    `L ${side === "l" ? g.wrist.lx : g.wrist.rx} ${g.wrist.y}`;

  const tY = g.shoulderY - 2;
  const sLx = g.shoulder.lx;
  const sRx = g.shoulder.rx;
  const torso = [
    `M ${sLx} ${tY}`,
    `Q ${cx} ${tY + 18} ${sRx} ${tY}`, // collarbone dip
    `C ${sRx + 8} ${tY + 44} ${cx + g.waistHalf + 6} ${g.waistY - 14} ${cx + g.waistHalf} ${g.waistY + 4}`,
    `L ${cx + g.waistHalf} ${g.waistY + 8}`,
    `L ${cx - g.waistHalf} ${g.waistY + 8}`,
    `L ${cx - g.waistHalf} ${g.waistY + 4}`,
    `C ${cx - g.waistHalf - 6} ${g.waistY - 14} ${sLx - 8} ${tY + 44} ${sLx} ${tY}`,
    "Z",
  ].join(" ");

  return (
    <g>
      {/* legs */}
      <path d={legPath(g.legX.l)} stroke={skin} strokeWidth={g.legThick} strokeLinecap="round" fill="none" />
      <path d={legPath(g.legX.r)} stroke={skin} strokeWidth={g.legThick} strokeLinecap="round" fill="none" />
      {/* arms */}
      <path d={armPath("l")} stroke={skin} strokeWidth={g.armThick} strokeLinecap="round" fill="none" />
      <path d={armPath("r")} stroke={skin} strokeWidth={g.armThick} strokeLinecap="round" fill="none" />
      {/* hands */}
      <circle cx={g.wrist.lx} cy={g.wrist.y + 4} r={g.armThick * 0.48} fill={skin} />
      <circle cx={g.wrist.rx} cy={g.wrist.y + 4} r={g.armThick * 0.48} fill={skin} />
      {/* neck (extends under torso so the collar dip shows skin) */}
      <rect
        x={cx - neck.w / 2}
        y={neck.y}
        width={neck.w}
        height={66}
        fill={skin}
      />
      <ellipse cx={cx} cy={neck.y + 3} rx={neck.w / 2} ry={5} fill={skinShade} opacity={0.55} />
      {/* torso (ends above the waistband line; base layer covers below) */}
      <path d={torso} fill={skin} />
      {/* ears */}
      <ellipse cx={head.cx - head.rx} cy={head.cy + 2} rx={5} ry={8} fill={skin} />
      <ellipse cx={head.cx + head.rx} cy={head.cy + 2} rx={5} ry={8} fill={skin} />
      {/* head */}
      <ellipse cx={head.cx} cy={head.cy} rx={head.rx} ry={head.ry} fill={skin} />
    </g>
  );
});

// ------------------------------------------------------------------

/** Modest base garment so the figure is never bare underneath items. */
export const BaseLayer = memo(function BaseLayer({ g }: { g: FigureGeometry }) {
  const shade = shadeHex(BASE_TONE, -16);
  const tY = g.shoulderY + 2;
  const tank = [
    `M ${cx0(g) - g.shoulderHalf * 0.52} ${tY}`,
    `L ${cx0(g) + g.shoulderHalf * 0.52} ${tY}`,
    `C ${cx0(g) + g.waistHalf - 2} ${g.waistY - 8} ${cx0(g) + g.waistHalf - 2} ${g.waistY + 22} ${cx0(g) + g.waistHalf - 2} ${g.waistY + 30}`,
    `L ${cx0(g) - g.waistHalf + 2} ${g.waistY + 30}`,
    `C ${cx0(g) - g.waistHalf + 2} ${g.waistY + 22} ${cx0(g) - g.waistHalf + 2} ${g.waistY - 8} ${cx0(g) - g.shoulderHalf * 0.52} ${tY}`,
    "Z",
  ].join(" ");

  const shortsTop = g.waistY - 12;
  const shortsBottom = g.hipDropY + 24;
  const shorts = [
    `M ${g.cx - g.hipHalf - 2} ${shortsTop}`,
    `L ${g.cx + g.hipHalf + 2} ${shortsTop}`,
    `L ${g.cx + g.hipHalf * 0.62} ${shortsBottom}`,
    `L ${g.cx + 5} ${shortsBottom - 8}`,
    `L ${g.cx} ${g.hipDropY - 2}`,
    `L ${g.cx - 5} ${shortsBottom - 8}`,
    `L ${g.cx - g.hipHalf * 0.62} ${shortsBottom}`,
    "Z",
  ].join(" ");

  return (
    <g>
      <path d={tank} fill={BASE_TONE} opacity={0.9} />
      <path d={shorts} fill={BASE_TONE} opacity={0.9} />
      <path
        d={`M ${g.cx - g.hipHalf - 2} ${shortsTop + 5} L ${g.cx + g.hipHalf + 2} ${shortsTop + 5}`}
        stroke={shade}
        strokeWidth={2}
        opacity={0.6}
      />
    </g>
  );
});

function cx0(g: FigureGeometry): number {
  return g.cx;
}

// ------------------------------------------------------------------

export const FaceLayer = memo(function FaceLayer({ g }: { g: FigureGeometry }) {
  const { cx, cy } = g.head;
  return (
    <g stroke={INK} strokeLinecap="round" fill="none">
      <path d={`M ${cx - 19} ${cy - 14} q 7 -5 14 -1`} strokeWidth={2.2} opacity={0.8} />
      <path d={`M ${cx + 5} ${cy - 15} q 7 -4 14 1`} strokeWidth={2.2} opacity={0.8} />
      <ellipse cx={cx - 12.5} cy={cy - 3} rx={2.6} ry={3.2} fill={INK} stroke="none" opacity={0.92} />
      <ellipse cx={cx + 12.5} cy={cy - 3} rx={2.6} ry={3.2} fill={INK} stroke="none" opacity={0.92} />
      <path d={`M ${cx + 1} ${cy + 2} v 8 q 0.5 3 -3.5 3`} strokeWidth={1.7} opacity={0.5} />
      <path d={`M ${cx - 7.5} ${cy + 17} q 7.5 5.5 15 0`} strokeWidth={2.1} opacity={0.78} />
    </g>
  );
});

// ------------------------------------------------------------------

interface HairProps {
  g: FigureGeometry;
  style: string;
  color: string;
}

export const HairLayer = memo(function HairLayer({ g, style, color }: HairProps) {
  const { cx, cy, rx, ry } = g.head;
  const sideY = cy - 6;
  const shade = shadeHex(color, -22);
  const light = shadeHex(color, 20);

  const cap = (sideDrop: number, topLift: number, fringeDrop: number): string => {
    const lOut = cx - rx - 4;
    const rOut = cx + rx + 4;
    const oY = sideY + sideDrop;
    const topOut = cy - ry - topLift;
    const lIn = cx - rx + 7;
    const rIn = cx + rx - 7;
    const iY = sideY - 1 + fringeDrop;
    const topIn = cy - ry + 6;
    return [
      `M ${lOut} ${oY}`,
      `C ${lOut} ${topOut - 16} ${rOut} ${topOut - 16} ${rOut} ${oY}`,
      `L ${rIn} ${iY}`,
      `C ${rIn} ${topIn} ${lIn} ${topIn} ${lIn} ${iY}`,
      "Z",
    ].join(" ");
  };

  const curtain = (side: "l" | "r", len: number, hook: number): string => {
    const dir = side === "l" ? -1 : 1;
    const tX = cx + dir * (rx - 6);
    const tY = sideY - 4;
    const oX = tX + dir * 12;
    const bY = tY + len;
    return [
      `M ${tX} ${tY}`,
      `C ${oX} ${tY + len * 0.25} ${oX + dir * 2} ${bY - len * 0.3} ${oX - dir * 2} ${bY}`,
      `C ${oX - dir * 6} ${bY + hook} ${tX - dir * 2} ${bY - 4} ${tX - dir * 6} ${bY - len * 0.35}`,
      `C ${tX - dir * 8} ${tY + len * 0.35} ${tX - dir * 4} ${tY + 8} ${tX} ${tY}`,
      "Z",
    ].join(" ");
  };

  const bluntBangs = (
    <path
      d={[
        `M ${cx - rx + 7} ${sideY + 12}`,
        `Q ${cx} ${sideY + 5} ${cx + rx - 7} ${sideY + 12}`,
        `L ${cx + rx - 7} ${sideY - 3}`,
        `C ${cx + rx - 7} ${cy - ry + 8} ${cx - rx + 7} ${cy - ry + 8} ${cx - rx + 7} ${sideY - 3}`,
        "Z",
      ].join(" ")}
      fill={color}
    />
  );

  switch (style) {
    case "fade":
      return (
        <g>
          <path d={cap(4, 2, -4)} fill={light} opacity={0.55} transform="scale(1.02) translate(-3 -1)" />
          <path d={cap(3, 7, -3)} fill={color} />
        </g>
      );
    case "short":
      return <path d={cap(6, 8, 0)} fill={color} />;
    case "wavy":
      return (
        <g>
          <path d={cap(24, 10, 6)} fill={color} />
          {[-20, -7, 7, 20].map((dx, i) => (
            <circle key={i} cx={cx + dx} cy={sideY + 7 + (i % 2) * 3} r={4.6} fill={color} />
          ))}
          {[-1, 1].map((d) => (
            <circle key={d} cx={cx + d * (rx + 1)} cy={sideY + 18} r={5} fill={color} />
          ))}
        </g>
      );
    case "curly": {
      const bumps: Array<[number, number]> = [];
      for (let i = 0; i <= 6; i++) {
        const a = (170 - (i * 160) / 6) * (Math.PI / 180);
        bumps.push([cx + (rx + 5) * Math.cos(a) * -1, cy - ry - 2 - Math.sin(a) * 8]);
      }
      return (
        <g>
          <path d={cap(12, 14, 6)} fill={color} />
          {bumps.map(([bx, by], i) => (
            <circle key={i} cx={bx} cy={by} r={8.5} fill={color} />
          ))}
          {[-16, 0, 16].map((dx, i) => (
            <circle key={`f${i}`} cx={cx + dx} cy={sideY + 6} r={5} fill={color} />
          ))}
        </g>
      );
    }
    case "long":
      return (
        <g>
          <path d={curtain("l", 92, 6)} fill={color} />
          <path d={curtain("r", 92, 6)} fill={color} />
          <path d={cap(16, 10, 4)} fill={color} />
        </g>
      );
    case "bob":
      return (
        <g>
          <path d={curtain("l", 50, -4)} fill={color} />
          <path d={curtain("r", 50, -4)} fill={color} />
          <path d={cap(14, 10, 2)} fill={color} />
          {bluntBangs}
        </g>
      );
    case "ponytail": {
      const tailX = cx + rx + 2;
      return (
        <g>
          <path
            d={[
              `M ${tailX - 10} ${cy - 8}`,
              `C ${tailX + 24} ${cy + 6} ${tailX + 20} ${cy + 62} ${tailX + 4} ${cy + 84}`,
              `C ${tailX + 10} ${cy + 46} ${tailX + 4} ${cy + 20} ${tailX - 12} ${cy + 8}`,
              "Z",
            ].join(" ")}
            fill={color}
          />
          <path d={cap(12, 9, 3)} fill={color} />
          <circle cx={tailX - 6} cy={cy + 2} r={4} fill={shade} />
          <path
            d={`M ${cx - rx + 7} ${sideY + 3} Q ${cx - 6} ${sideY - 4} ${cx + 10} ${sideY + 3}`}
            stroke={shade}
            strokeWidth={2.5}
            fill="none"
            strokeLinecap="round"
            opacity={0.7}
          />
        </g>
      );
    }
    case "medium":
    default:
      return <path d={cap(17, 10, 2)} fill={color} />;
  }
});

// ------------------------------------------------------------------

interface BeardProps {
  g: FigureGeometry;
  style: string; // none | stubble | short | full | mustache
  color: string;
}

export const BeardLayer = memo(function BeardLayer({ g, style, color }: BeardProps) {
  if (style === "none") return null;
  const { cx, cy, rx, ry } = g.head;
  const beardColor = shadeHex(color, -16);
  const jawL = { x: cx - rx + 4, y: cy + 4 };
  const jawR = { x: cx + rx - 4, y: cy + 4 };
  const jawB = { x: cx, y: cy + ry - 2 };

  const mustache = (
    <path
      d={[
        `M ${cx - 9} ${cy + 12}`,
        `Q ${cx - 4} ${cy + 8.5} ${cx} ${cy + 11}`,
        `Q ${cx + 4} ${cy + 8.5} ${cx + 9} ${cy + 12}`,
        `Q ${cx + 4} ${cy + 15.5} ${cx} ${cy + 14.5}`,
        `Q ${cx - 4} ${cy + 15.5} ${cx - 9} ${cy + 12}`,
        "Z",
      ].join(" ")}
      fill={beardColor}
    />
  );

  if (style === "mustache") return <g>{mustache}</g>;

  const drop = style === "full" ? 22 : 0;
  const opacity = style === "stubble" ? 0.24 : 0.94;

  return (
    <g>
      <path
        d={[
          `M ${jawL.x} ${jawL.y}`,
          `C ${jawL.x - 2} ${jawB.y - 12} ${cx - 16} ${jawB.y + drop} ${cx} ${jawB.y + drop}`,
          `C ${cx + 16} ${jawB.y + drop} ${jawR.x + 2} ${jawB.y - 12} ${jawR.x} ${jawR.y}`,
          `C ${jawR.x - 1} ${cy + 20} ${cx + 12} ${jawB.y - 12 + drop * 0.4} ${cx} ${jawB.y - 12 + drop * 0.4}`,
          `C ${cx - 12} ${jawB.y - 12 + drop * 0.4} ${jawL.x + 1} ${cy + 20} ${jawL.x} ${jawL.y}`,
          "Z",
        ].join(" ")}
        fill={beardColor}
        opacity={opacity}
      />
      {style !== "stubble" && mustache}
    </g>
  );
});

// ------------------------------------------------------------------

export const GlassesLayer = memo(function GlassesLayer({ g }: { g: FigureGeometry }) {
  const { cx, cy, rx } = g.head;
  const w = 23;
  const h = 15;
  const y = cy - 10;
  const lx = cx - 12.5 - w / 2;
  const rxPos = cx + 12.5 - w / 2;
  return (
    <g stroke={INK} strokeWidth={2.2} fill="rgb(23 20 14 / 0.05)">
      <rect x={lx} y={y} width={w} height={h} rx={6} />
      <rect x={rxPos} y={y} width={w} height={h} rx={6} />
      <path d={`M ${lx + w} ${y + 5} L ${rxPos} ${y + 5}`} fill="none" />
      <path d={`M ${lx} ${y + 4} L ${cx - rx} ${y + 2}`} fill="none" />
      <path d={`M ${rxPos + w} ${y + 4} L ${cx + rx} ${y + 2}`} fill="none" />
    </g>
  );
});
