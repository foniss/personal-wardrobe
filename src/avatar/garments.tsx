// ------------------------------------------------------------------
// Garment layers: draws clothing silhouettes onto the figure,
// tinted from the wardrobe item's extracted colours. Silhouettes
// are derived per subtype (tshirt, jeans, coat, scarf…) and scale
// automatically with the figure geometry.
// ------------------------------------------------------------------

import { memo } from "react";
import type { FigureGeometry } from "./geometry";
import type { GarmentSpec } from "./spec";

const SOLE = "#f5f1e8";
const INK_LINE = "rgb(23 20 14 / 0.5)";

interface PieceProps {
  g: FigureGeometry;
  spec: GarmentSpec;
}

// ---------------------------------------------------------------- tops

const TopPiece = memo(function TopPiece({ g, spec }: PieceProps) {
  const { main, shade, light } = spec.colors;
  const fitAdj = spec.fit === "boxy" ? 12 : spec.fit === "slim" ? 1 : 5;
  const ty = g.shoulderY - 4;
  const shW = g.shoulderHalf;
  const crop = spec.subtype === "crop";
  const hemY = crop ? g.waistY + 4 : g.waistY + 28;
  const bw = g.waistHalf + fitAdj; // half-width at hem
  const bulky = spec.subtype === "sweater" || spec.subtype === "hoodie" || spec.subtype === "overshirt";
  const sleeveKind =
    spec.subtype === "tank"
      ? "none"
      : spec.subtype === "tshirt" || spec.subtype === "crop"
        ? "short"
        : "long";

  const tl = g.cx - shW - 3;
  const tr = g.cx + shW + 3;

  const topLine =
    spec.subtype === "tank"
      ? `M ${g.cx - shW * 0.52} ${ty} Q ${g.cx} ${ty + 30} ${g.cx + shW * 0.52} ${ty}`
      : `M ${tl} ${ty} Q ${g.cx} ${ty + 18} ${tr} ${ty}`;

  const bodice = [
    topLine,
    `C ${tr + 8} ${ty + 46} ${g.cx + bw + 3} ${g.waistY - 4} ${g.cx + bw + (bulky ? 3 : 0)} ${hemY}`,
    `L ${g.cx - bw - (bulky ? 3 : 0)} ${hemY}`,
    `C ${g.cx - bw - 3} ${g.waistY - 4} ${tl - 8} ${ty + 46} ${tl} ${ty}`,
    "Z",
  ].join(" ");

  // sleeve strokes follow the arm joints
  const armSeg = (side: "l" | "r") => {
    const s = side === "l" ? { x: g.shoulder.lx, y: g.shoulder.y + 4 } : { x: g.shoulder.rx, y: g.shoulder.y + 4 };
    const e = side === "l" ? g.elbow : { lx: g.elbow.rx, rx: 0, y: g.elbow.y };
    const ex = side === "l" ? g.elbow.lx : g.elbow.rx;
    const w = side === "l" ? g.wrist.lx : g.wrist.rx;
    void e;
    const elbowPt = { x: ex, y: g.elbow.y };
    const wristPt = { x: w, y: g.wrist.y };
    const shortEnd = {
      x: s.x + (elbowPt.x - s.x) * 0.5,
      y: s.y + (elbowPt.y - s.y) * 0.5,
    };
    const cuffStart = {
      x: elbowPt.x + (wristPt.x - elbowPt.x) * 0.8,
      y: elbowPt.y + (wristPt.y - elbowPt.y) * 0.8,
    };
    return { s, elbowPt, wristPt, shortEnd, cuffStart };
  };

  const sleeveW = g.armThick + (bulky ? 8 : 6);

  const sleeves = (kind: "short" | "long") =>
    (["l", "r"] as const).map((side) => {
      const a = armSeg(side);
      const end = kind === "short" ? a.shortEnd : { x: a.wristPt.x, y: a.wristPt.y - 8 };
      const cuffStart =
        kind === "short"
          ? { x: a.s.x + (a.shortEnd.x - a.s.x) * 0.72, y: a.s.y + (a.shortEnd.y - a.s.y) * 0.72 }
          : a.cuffStart;
      return (
        <g key={side}>
          <path
            d={`M ${a.s.x} ${a.s.y} L ${a.elbowPt.x} ${a.elbowPt.y} L ${end.x} ${end.y}`}
            stroke={main}
            strokeWidth={sleeveW}
            strokeLinecap="round"
            fill="none"
          />
          {(bulky || spec.subtype === "longsleeve" || kind === "short") && (
            <path
              d={`M ${cuffStart.x} ${cuffStart.y} L ${end.x} ${end.y}`}
              stroke={shade}
              strokeWidth={sleeveW + (bulky ? 1.5 : 1)}
              strokeLinecap="butt"
              fill="none"
              opacity={0.85}
            />
          )}
        </g>
      );
    });

  const isShirtLike = spec.subtype === "shirt" || spec.subtype === "overshirt";

  return (
    <g>
      {spec.subtype === "hoodie" && (
        <path
          d={[
            `M ${g.cx - shW * 0.66} ${ty + 18}`,
            `C ${g.cx - shW * 0.9} ${ty - 22} ${g.cx + shW * 0.9} ${ty - 22} ${g.cx + shW * 0.66} ${ty + 18}`,
            `C ${g.cx + 18} ${ty + 4} ${g.cx - 18} ${ty + 4} ${g.cx - shW * 0.66} ${ty + 18}`,
            "Z",
          ].join(" ")}
          fill={shade}
        />
      )}
      <path d={bodice} fill={main} />
      {/* collar */}
      {isShirtLike ? (
        <g fill={shade}>
          <path d={`M ${g.cx - 17} ${ty + 1} L ${g.cx} ${ty + 15} L ${g.cx - 4} ${ty + 22} L ${g.cx - 21} ${ty + 8} Z`} />
          <path d={`M ${g.cx + 17} ${ty + 1} L ${g.cx} ${ty + 15} L ${g.cx + 4} ${ty + 22} L ${g.cx + 21} ${ty + 8} Z`} />
        </g>
      ) : (
        <path
          d={`M ${g.cx - 17} ${ty + 1} Q ${g.cx} ${ty + 19} ${g.cx + 17} ${ty + 1}`}
          stroke={shade}
          strokeWidth={bulky ? 7 : 4.5}
          fill="none"
          strokeLinecap="round"
        />
      )}
      {sleeveKind !== "none" && sleeves(sleeveKind)}
      {/* placket + buttons / pockets */}
      {isShirtLike && (
        <g>
          <path d={`M ${g.cx} ${ty + 14} L ${g.cx} ${hemY}`} stroke={shade} strokeWidth={2} opacity={0.75} />
          {[30, 52, 74].map((dy) => (
            <circle key={dy} cx={g.cx} cy={ty + dy} r={1.5} fill={shade} />
          ))}
        </g>
      )}
      {spec.subtype === "overshirt" &&
        [-1, 1].map((d) => (
          <g key={d}>
            <rect
              x={g.cx + d * 24 - 11}
              y={ty + 46}
              width={22}
              height={20}
              rx={3}
              fill={shade}
              opacity={0.45}
            />
            <path
              d={`M ${g.cx + d * 24 - 11} ${ty + 50} L ${g.cx + d * 24 + 11} ${ty + 50}`}
              stroke={shade}
              strokeWidth={2}
              opacity={0.7}
            />
          </g>
        ))}
      {spec.subtype === "hoodie" && (
        <g>
          <path
            d={`M ${g.cx - 24} ${hemY - 42} L ${g.cx + 24} ${hemY - 42} L ${g.cx + 20} ${hemY - 10} L ${g.cx - 20} ${hemY - 10} Z`}
            fill={shade}
            opacity={0.35}
          />
          {[-8, 8].map((dx) => (
            <path
              key={dx}
              d={`M ${g.cx + dx} ${ty + 22} L ${g.cx + dx + (dx > 0 ? 2 : -2)} ${ty + 38}`}
              stroke={light}
              strokeWidth={2.4}
              strokeLinecap="round"
            />
          ))}
        </g>
      )}
      {(spec.subtype === "sweater" || spec.subtype === "hoodie") && (
        <path
          d={`M ${g.cx - bw - 3} ${hemY - 10} L ${g.cx + bw + 3} ${hemY - 10} L ${g.cx + bw + 3} ${hemY} L ${g.cx - bw - 3} ${hemY} Z`}
          fill={shade}
          opacity={0.55}
        />
      )}
      {!bulky && !isShirtLike && (
        <path
          d={`M ${g.cx - bw} ${hemY - 6} L ${g.cx + bw} ${hemY - 6}`}
          stroke={shade}
          strokeWidth={1.5}
          opacity={0.5}
        />
      )}
    </g>
  );
});

// ------------------------------------------------------------- bottoms

const BottomPiece = memo(function BottomPiece({ g, spec }: PieceProps) {
  const { main, shade, light } = spec.colors;
  const waistTop = g.waistY - 14;
  const extra =
    spec.subtype === "cargo"
      ? 10
      : spec.subtype === "leggings"
        ? 3
        : spec.subtype === "jeans"
          ? 7
          : 8;

  const isSkirt = spec.subtype.includes("skirt");
  const hemY =
    spec.subtype === "shorts"
      ? g.hipDropY + 34
      : spec.subtype === "miniskirt"
        ? g.hipDropY + 44
        : spec.subtype === "skirt"
          ? g.kneeY - 2
          : spec.subtype === "maxiskirt"
            ? g.ankleY - 24
            : g.ankleY - 4;

  const hips = [
    `M ${g.cx - g.hipHalf - 4} ${waistTop + 8}`,
    `L ${g.cx + g.hipHalf + 4} ${waistTop + 8}`,
    `L ${g.cx + g.hipHalf * 0.66} ${g.hipDropY + 20}`,
    `L ${g.cx + 6} ${g.hipDropY + 14}`,
    `L ${g.cx} ${g.hipDropY - 4}`,
    `L ${g.cx - 6} ${g.hipDropY + 14}`,
    `L ${g.cx - g.hipHalf * 0.66} ${g.hipDropY + 20}`,
    "Z",
  ].join(" ");

  const leg = (x: number) => (
    <g key={x}>
      <path
        d={`M ${x} ${g.hipDropY + 14} L ${x} ${g.kneeY} L ${x} ${hemY}`}
        stroke={main}
        strokeWidth={g.legThick + extra}
        strokeLinecap="round"
        fill="none"
      />
      {spec.subtype === "jeans" && hemY > g.kneeY && (
        <path
          d={`M ${x} ${hemY - 12} L ${x} ${hemY}`}
          stroke={light}
          strokeWidth={g.legThick + extra + 1}
          strokeLinecap="butt"
          fill="none"
          opacity={0.55}
        />
      )}
      {spec.subtype === "shorts" && (
        <path
          d={`M ${x} ${hemY - 7} L ${x} ${hemY}`}
          stroke={shade}
          strokeWidth={g.legThick + extra + 1}
          strokeLinecap="butt"
          fill="none"
          opacity={0.7}
        />
      )}
    </g>
  );

  if (isSkirt) {
    const skirt = [
      `M ${g.cx - g.waistHalf - 3} ${waistTop + 6}`,
      `L ${g.cx + g.waistHalf + 3} ${waistTop + 6}`,
      `L ${g.cx + g.hipHalf + 22} ${hemY}`,
      `L ${g.cx - g.hipHalf - 22} ${hemY}`,
      "Z",
    ].join(" ");
    return (
      <g>
        <path d={skirt} fill={main} />
        <path
          d={`M ${g.cx} ${waistTop + 12} L ${g.cx} ${hemY - 6}`}
          stroke={shade}
          strokeWidth={1.6}
          opacity={0.4}
        />
        <path
          d={`M ${g.cx - g.hipHalf - 22} ${hemY} L ${g.cx + g.hipHalf + 22} ${hemY}`}
          stroke={shade}
          strokeWidth={2}
          opacity={0.5}
        />
        <rect x={g.cx - g.waistHalf - 3} y={waistTop} width={g.waistHalf * 2 + 6} height={14} fill={shade} />
      </g>
    );
  }

  return (
    <g>
      <path d={hips} fill={main} />
      {leg(g.legX.l)}
      {leg(g.legX.r)}
      <rect x={g.cx - g.waistHalf - 3} y={waistTop} width={g.waistHalf * 2 + 6} height={15} fill={shade} />
      <path
        d={`M ${g.cx} ${waistTop + 15} L ${g.cx} ${waistTop + 33}`}
        stroke={shade}
        strokeWidth={2}
        opacity={0.65}
      />
      {spec.subtype === "jeans" &&
        [-1, 1].map((d) => (
          <path
            key={d}
            d={`M ${g.cx + d * (g.hipHalf - 8)} ${waistTop + 20} q ${-d * 10} 3 ${-d * 12} 13`}
            stroke={shade}
            strokeWidth={1.8}
            fill="none"
            opacity={0.7}
          />
        ))}
      {spec.subtype === "cargo" &&
        [g.legX.l, g.legX.r].map((x) => (
          <g key={x}>
            <rect
              x={x - (g.legThick + extra) / 2}
              y={g.kneeY - 48}
              width={g.legThick + extra}
              height={19}
              rx={2}
              fill={shade}
              opacity={0.5}
            />
            <path
              d={`M ${x - (g.legThick + extra) / 2} ${g.kneeY - 43} L ${x + (g.legThick + extra) / 2} ${g.kneeY - 43}`}
              stroke={light}
              strokeWidth={1.6}
              opacity={0.7}
            />
          </g>
        ))}
    </g>
  );
});

// --------------------------------------------------------------- shoes

const ShoePiece = memo(function ShoePiece({ g, spec }: PieceProps) {
  const { main, shade, light } = spec.colors;

  const foot = (x: number) => {
    switch (spec.subtype) {
      case "boots":
        return (
          <g key={x}>
            <rect x={x - 13} y={g.ankleY - 30} width={26} height={38} rx={4} fill={main} />
            <path
              d={`M ${x - 15} ${g.ankleY + 6} C ${x - 15} ${g.ankleY - 2} ${x + 15} ${g.ankleY - 2} ${x + 15} ${g.ankleY + 6} L ${x + 15} ${g.ankleY + 9} L ${x - 15} ${g.ankleY + 9} Z`}
              fill={main}
            />
            <rect x={x - 16} y={g.ankleY + 9} width={32} height={7} rx={2.5} fill={shade} />
            <path d={`M ${x - 9} ${g.ankleY - 30} L ${x - 9} ${g.ankleY - 24}`} stroke={shade} strokeWidth={2.4} opacity={0.7} />
          </g>
        );
      case "heels":
        return (
          <g key={x}>
            <path
              d={`M ${x - 13} ${g.ankleY + 6} C ${x - 13} ${g.ankleY - 3} ${x + 13} ${g.ankleY - 3} ${x + 13} ${g.ankleY + 6} Z`}
              fill={main}
            />
            <rect x={x - 14} y={g.ankleY + 6} width={28} height={3.6} rx={1.8} fill={shade} />
            <path d={`M ${x - 11} ${g.ankleY + 9} L ${x - 11} ${g.ankleY + 16}`} stroke={shade} strokeWidth={3.4} strokeLinecap="round" />
            <path d={`M ${x + 11} ${g.ankleY + 9} L ${x + 11} ${g.ankleY + 16}`} stroke={shade} strokeWidth={3.4} strokeLinecap="round" />
          </g>
        );
      case "sandals":
        return (
          <g key={x}>
            <rect x={x - 15} y={g.ankleY + 4} width={30} height={10} rx={5} fill={SOLE} />
            <path d={`M ${x - 11} ${g.ankleY + 2} L ${x + 11} ${g.ankleY + 6}`} stroke={main} strokeWidth={3.4} strokeLinecap="round" />
            <path d={`M ${x - 11} ${g.ankleY + 6} L ${x + 11} ${g.ankleY + 2}`} stroke={main} strokeWidth={3.4} strokeLinecap="round" />
          </g>
        );
      case "flats":
        return (
          <g key={x}>
            <path
              d={`M ${x - 13} ${g.ankleY + 6} C ${x - 13} ${g.ankleY - 4} ${x + 13} ${g.ankleY - 4} ${x + 13} ${g.ankleY + 6} Z`}
              fill={main}
            />
            <rect x={x - 14} y={g.ankleY + 6} width={28} height={4.4} rx={2.2} fill={shade} />
          </g>
        );
      case "sneakers":
      default:
        return (
          <g key={x}>
            <rect x={x - 15} y={g.ankleY + 5} width={30} height={10} rx={5} fill={SOLE} />
            <path
              d={`M ${x - 14} ${g.ankleY + 6} C ${x - 14} ${g.ankleY - 6} ${x + 14} ${g.ankleY - 6} ${x + 14} ${g.ankleY + 6} Z`}
              fill={main}
            />
            {[-5, 0, 5].map((dy) => (
              <path
                key={dy}
                d={`M ${x - 5} ${g.ankleY + dy} L ${x + 5} ${g.ankleY + dy}`}
                stroke={shade}
                strokeWidth={1.7}
                opacity={0.75}
              />
            ))}
            <path
              d={`M ${x - 14} ${g.ankleY + 6} C ${x - 14} ${g.ankleY - 1} ${x - 7} ${g.ankleY - 5} ${x + 1} ${g.ankleY - 5}`}
              stroke={light}
              strokeWidth={1.6}
              fill="none"
              opacity={0.6}
            />
          </g>
        );
    }
  };

  return (
    <g>
      {foot(g.legX.l)}
      {foot(g.legX.r)}
    </g>
  );
});

// ---------------------------------------------------------- outerwear

const OuterwearPiece = memo(function OuterwearPiece({ g, spec }: PieceProps) {
  const { main, shade, light } = spec.colors;
  const long = spec.subtype === "coat" || spec.subtype === "blazer" ? true : spec.subtype === "puffer" ? false : false;
  const longCoat = spec.subtype === "coat";
  const hemY = longCoat ? g.kneeY + 12 : g.hipY + 36;
  const ty = g.shoulderY - 8;
  const shE = g.shoulderHalf + (spec.subtype === "puffer" ? 14 : 10);
  const flare = longCoat ? 24 : 14;
  const hemHalf = g.hipHalf + flare;

  const panel = (side: "l" | "r") => {
    const d = side === "l" ? -1 : 1;
    const sX = g.cx + d * shE;
    return [
      `M ${sX} ${ty}`,
      `C ${sX + d * 6} ${ty + 60} ${g.cx + d * (hemHalf + 2)} ${hemY - 28} ${g.cx + d * hemHalf} ${hemY}`,
      `L ${g.cx + d * 7.5} ${hemY}`,
      `L ${g.cx + d * 5.5} ${ty + 30}`,
      `C ${g.cx + d * 17} ${ty + 12} ${sX - d * 6} ${ty + 6} ${sX} ${ty}`,
      "Z",
    ].join(" ");
  };

  const sleeve = (side: "l" | "r") => {
    const s = side === "l" ? { x: g.shoulder.lx - 7, y: g.shoulder.y } : { x: g.shoulder.rx + 7, y: g.shoulder.y };
    const ex = side === "l" ? g.elbow.lx - 7 : g.elbow.rx + 7;
    const wx = side === "l" ? g.wrist.lx - 7 : g.wrist.rx + 7;
    return (
      <g key={side}>
        <path
          d={`M ${s.x} ${s.y} L ${ex} ${g.elbow.y} L ${wx} ${g.wrist.y - 2}`}
          stroke={main}
          strokeWidth={g.armThick + 11}
          strokeLinecap="round"
          fill="none"
        />
        <path
          d={`M ${wx - (wx - ex) * 0.18} ${g.wrist.y - 2 - 22} L ${wx} ${g.wrist.y - 2}`}
          stroke={shade}
          strokeWidth={g.armThick + 12}
          strokeLinecap="butt"
          fill="none"
          opacity={0.8}
        />
      </g>
    );
  };

  const lapel = (side: "l" | "r") => {
    const d = side === "l" ? -1 : 1;
    return spec.subtype === "blazer"
      ? `M ${g.cx + d * 20} ${ty + 4} L ${g.cx + d * 4} ${ty + 40} L ${g.cx + d * 22} ${ty + 48} L ${g.cx + d * 27} ${ty + 12} Z`
      : `M ${g.cx + d * 24} ${ty + 2} L ${g.cx + d * 5} ${ty + 34} L ${g.cx + d * 23} ${ty + 56} L ${g.cx + d * 31} ${ty + 10} Z`;
  };

  void long;
  return (
    <g>
      {/* back collar */}
      <path
        d={[
          `M ${g.cx - 19} ${ty + 4}`,
          `C ${g.cx - 19} ${ty - 14} ${g.cx + 19} ${ty - 14} ${g.cx + 19} ${ty + 4}`,
          `L ${g.cx + 12} ${ty + 10} L ${g.cx - 12} ${ty + 10} Z`,
        ].join(" ")}
        fill={shade}
      />
      {sleeve("l")}
      {sleeve("r")}
      <path d={panel("l")} fill={main} />
      <path d={panel("r")} fill={main} />
      {spec.subtype === "puffer" &&
        [0.22, 0.44, 0.66, 0.88].map((t) => {
          const y = ty + (hemY - ty) * t;
          return (
            <g key={t}>
              <path
                d={`M ${g.cx - shE - 2 - t * 8} ${y} L ${g.cx - 7.5} ${y}`}
                stroke={shade}
                strokeWidth={3}
                opacity={0.75}
              />
              <path
                d={`M ${g.cx + 7.5} ${y} L ${g.cx + shE + 2 + t * 8} ${y}`}
                stroke={shade}
                strokeWidth={3}
                opacity={0.75}
              />
            </g>
          );
        })}
      <path d={lapel("l")} fill={shade} />
      <path d={lapel("r")} fill={shade} />
      {longCoat && (
        <g>
          <path
            d={`M ${g.cx - hemHalf + 6} ${g.waistY + 10} L ${g.cx - 7.5} ${g.waistY + 10}`}
            stroke={shade}
            strokeWidth={3}
            opacity={0.8}
          />
          <path
            d={`M ${g.cx + 7.5} ${g.waistY + 10} L ${g.cx + hemHalf - 6} ${g.waistY + 10}`}
            stroke={shade}
            strokeWidth={3}
            opacity={0.8}
          />
          <path d={`M ${g.cx} ${g.waistY + 4} l -11 -5 l 0 12 Z`} fill={shade} />
          <path d={`M ${g.cx} ${g.waistY + 4} l 11 -5 l 0 12 Z`} fill={shade} />
        </g>
      )}
      {spec.subtype === "blazer" && (
        <g>
          <circle cx={g.cx} cy={g.waistY + 22} r={2} fill={shade} />
          <path
            d={`M ${g.cx - shE + 14} ${ty + 26} l 10 4 l -9 4`}
            stroke={light}
            strokeWidth={1.8}
            fill="none"
            opacity={0.8}
          />
        </g>
      )}
      {/* hem line */}
      <path
        d={`M ${g.cx - hemHalf} ${hemY} L ${g.cx - 7.5} ${hemY} M ${g.cx + 7.5} ${hemY} L ${g.cx + hemHalf} ${hemY}`}
        stroke={INK_LINE}
        strokeWidth={1.4}
        opacity={0.4}
      />
    </g>
  );
});

// ---------------------------------------------------------- accessory

const AccessoryPiece = memo(function AccessoryPiece({ g, spec }: PieceProps) {
  const { main, shade, light, accent } = spec.colors;
  const { cx, head, neck } = { cx: g.cx, head: g.head, neck: g.neck };

  switch (spec.subtype) {
    case "scarf": {
      const ny = neck.y + 14;
      return (
        <g>
          <path
            d={`M ${cx - 23} ${ny} Q ${cx} ${ny + 17} ${cx + 23} ${ny}`}
            stroke={main}
            strokeWidth={15}
            fill="none"
            strokeLinecap="round"
          />
          <path
            d={`M ${cx - 20} ${ny - 8} Q ${cx} ${ny + 4} ${cx + 20} ${ny - 8}`}
            stroke={shade}
            strokeWidth={10}
            fill="none"
            strokeLinecap="round"
            opacity={0.9}
          />
          <path
            d={`M ${cx + 15} ${ny + 10} L ${cx + 29} ${ny + 13} L ${cx + 25} ${ny + 64} L ${cx + 12} ${ny + 61} Z`}
            fill={main}
          />
          {[0, 6, 12].map((dx) => (
            <path
              key={dx}
              d={`M ${cx + 13 + dx} ${ny + 61} L ${cx + 13.5 + dx} ${ny + 68}`}
              stroke={light}
              strokeWidth={2}
              strokeLinecap="round"
            />
          ))}
        </g>
      );
    }
    case "hat": {
      const { cy, rx, ry } = head;
      return (
        <g>
          <path
            d={[
              `M ${cx - rx - 6} ${cy - 10}`,
              `C ${cx - rx - 9} ${cy - ry - 14} ${cx + rx + 9} ${cy - ry - 14} ${cx + rx + 6} ${cy - 10}`,
              `L ${cx + rx + 6} ${cy - 1} L ${cx - rx - 6} ${cy - 1} Z`,
            ].join(" ")}
            fill={main}
          />
          <rect x={cx - rx - 6} y={cy - 11} width={rx * 2 + 12} height={10} rx={4.5} fill={shade} />
        </g>
      );
    }
    case "tote": {
      const bx = g.wrist.lx - 21;
      const by = g.wrist.y + 4;
      return (
        <g>
          <path
            d={`M ${bx + 7} ${by + 3} Q ${g.wrist.lx - 6} ${g.wrist.y - 18} ${g.wrist.lx + 2} ${g.wrist.y + 1}`}
            stroke={shade}
            strokeWidth={3.2}
            fill="none"
          />
          <path
            d={`M ${bx + 27} ${by + 3} Q ${g.wrist.lx + 12} ${g.wrist.y - 16} ${g.wrist.lx + 2} ${g.wrist.y + 1}`}
            stroke={shade}
            strokeWidth={3.2}
            fill="none"
          />
          <rect x={bx} y={by + 2} width={42} height={40} rx={7} fill={main} />
          <path d={`M ${bx + 7} ${by + 13} L ${bx + 35} ${by + 13}`} stroke={shade} strokeWidth={2} opacity={0.7} />
          <rect x={bx + 7} y={by + 2} width={42} height={40} rx={7} fill="none" stroke={shade} strokeWidth={1.4} opacity={0.5} transform={`translate(-7 0)`} />
        </g>
      );
    }
    case "watch": {
      const wx = g.wrist.lx;
      const wy = g.wrist.y;
      return (
        <g>
          <path d={`M ${wx - 5.5} ${wy - 4} L ${wx + 5.5} ${wy + 2}`} stroke={main} strokeWidth={g.armThick * 0.9} strokeLinecap="round" opacity={0.95} />
          <circle cx={wx} cy={wy - 1} r={3.8} fill={light} stroke={shade} strokeWidth={1.6} />
        </g>
      );
    }
    case "belt":
      return (
        <g>
          <rect x={cx - g.waistHalf - 4} y={g.waistY - 3} width={g.waistHalf * 2 + 8} height={9} rx={2} fill={main} />
          <rect x={cx - 6} y={g.waistY - 4.5} width={12} height={12} rx={2} fill={light} stroke={shade} strokeWidth={1.6} />
        </g>
      );
    case "pendant":
    default: {
      const ty = g.shoulderY - 4;
      return (
        <g>
          <path
            d={`M ${cx - 13} ${ty + 14} Q ${cx} ${ty + 36} ${cx + 13} ${ty + 14}`}
            stroke={accent}
            strokeWidth={1.8}
            fill="none"
          />
          <circle cx={cx} cy={ty + 27} r={3.2} fill={accent} />
        </g>
      );
    }
  }
});

// ------------------------------------------------------------- dresses

const DressPiece = memo(function DressPiece({ g, spec }: PieceProps) {
  const { main, shade, light } = spec.colors;
  const ty = g.shoulderY - 4;
  const shW = g.shoulderHalf;
  const hemY =
    spec.subtype === "minidress"
      ? g.hipDropY + 48
      : spec.subtype === "maxidress"
        ? g.ankleY - 28
        : g.kneeY - 4;
  const flare = spec.subtype === "slipdress" ? g.hipHalf + 10 : g.hipHalf + 21;
  const bw = g.waistHalf + 2;

  const dress = [
    `M ${g.cx - shW * 0.58} ${ty}`,
    `Q ${g.cx} ${ty + 17} ${g.cx + shW * 0.58} ${ty}`,
    `C ${g.cx + bw + 2} ${g.waistY - 8} ${g.cx + bw} ${g.waistY + 6} ${g.cx + bw + 2} ${g.waistY + 12}`,
    `C ${g.cx + flare - 6} ${g.hipY + 40} ${g.cx + flare} ${hemY - 30} ${g.cx + flare} ${hemY}`,
    `L ${g.cx - flare} ${hemY}`,
    `C ${g.cx - flare} ${hemY - 30} ${g.cx - flare + 6} ${g.hipY + 40} ${g.cx - bw - 2} ${g.waistY + 12}`,
    `C ${g.cx - bw} ${g.waistY + 6} ${g.cx - bw - 2} ${g.waistY - 8} ${g.cx - shW * 0.58} ${ty}`,
    "Z",
  ].join(" ");

  return (
    <g>
      <path d={dress} fill={main} />
      {spec.subtype === "shirtdress" && (
        <g>
          <path d={`M ${g.cx} ${ty + 14} L ${g.cx} ${g.waistY + 10}`} stroke={shade} strokeWidth={2} opacity={0.75} />
          {[26, 44].map((dy) => (
            <circle key={dy} cx={g.cx} cy={ty + dy} r={1.5} fill={shade} />
          ))}
        </g>
      )}
      <path
        d={`M ${g.cx - 15} ${ty + 1} Q ${g.cx} ${ty + 17} ${g.cx + 15} ${ty + 1}`}
        stroke={shade}
        strokeWidth={4}
        fill="none"
        strokeLinecap="round"
      />
      <path d={`M ${g.cx - flare} ${hemY} L ${g.cx + flare} ${hemY}`} stroke={shade} strokeWidth={2} opacity={0.5} />
      {[-bw, bw].map((_, i) => (
        <path
          key={i}
          d={`M ${g.cx + (i === 0 ? -bw : bw)} ${g.waistY + 10} L ${g.cx + (i === 0 ? -flare + 12 : flare - 12)} ${hemY - 8}`}
          stroke={shade}
          strokeWidth={1.4}
          opacity={0.35}
        />
      ))}
      {light && null}
    </g>
  );
});

// ------------------------------------------------------------- routing

export const GarmentLayer = memo(function GarmentLayer({
  g,
  spec,
}: PieceProps) {
  switch (spec.kind) {
    case "top":
      return <TopPiece g={g} spec={spec} />;
    case "bottom":
      return <BottomPiece g={g} spec={spec} />;
    case "shoes":
      return <ShoePiece g={g} spec={spec} />;
    case "outerwear":
      return <OuterwearPiece g={g} spec={spec} />;
    case "accessory":
      return <AccessoryPiece g={g} spec={spec} />;
    case "dress":
      return <DressPiece g={g} spec={spec} />;
    default:
      return null;
  }
});

/** Fixed wardrobe drawing order inside a zone. */
const KIND_ORDER: Record<GarmentSpec["kind"], number> = {
  shoes: 0,
  bottom: 1,
  dress: 2,
  top: 3,
  outerwear: 4,
  accessory: 5,
};

export function GarmentSet({
  g,
  specs,
  zone,
}: {
  g: FigureGeometry;
  specs: GarmentSpec[];
  zone: "body" | "head";
}) {
  const list = specs
    .filter((s) => s.zone === zone)
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
  return (
    <>
      {list.map((s) => (
        <GarmentLayer key={s.itemId} g={g} spec={s} />
      ))}
    </>
  );
}
