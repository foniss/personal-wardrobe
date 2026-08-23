"use client";

import { useEffect } from "react";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";

export function ScoreDial({
  value,
  size = 132,
  stroke = 6,
  label = "harmony",
}: {
  value: number;
  size?: number;
  stroke?: number;
  label?: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const mv = useMotionValue(0);

  useEffect(() => {
    const controls = animate(mv, value, {
      duration: 1.15,
      ease: [0.22, 1, 0.36, 1],
    });
    return () => controls.stop();
  }, [value, mv]);

  const rounded = useTransform(mv, (v) => Math.round(v));
  const dashOffset = useTransform(
    mv,
    (v) => circumference - (Math.max(0, Math.min(100, v)) / 100) * circumference,
  );

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgb(23 20 14 / 0.12)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#ff3d12"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          style={{ strokeDashoffset: dashOffset }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        <motion.span
          className="font-display leading-none tracking-tight"
          style={{ fontSize: size * 0.3 }}
        >
          {rounded}
        </motion.span>
        <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-ink-soft">
          {label}
        </span>
      </div>
    </div>
  );
}
