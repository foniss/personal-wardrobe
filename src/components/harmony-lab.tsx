"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import { ScoreDial } from "@/components/score-dial";
import {
  harmonyScore,
  relationName,
  relationVerdict,
  hueDistanceHex,
  isNeutralHex,
} from "@/lib/colors";

const SWATCHES = [
  { name: "Jet black", hex: "#17140e" },
  { name: "Ivory", hex: "#f0ead9" },
  { name: "Indigo", hex: "#2e4070" },
  { name: "Denim", hex: "#41618a" },
  { name: "Sage", hex: "#9da98d" },
  { name: "Forest", hex: "#2f4a34" },
  { name: "Sand", hex: "#cbae87" },
  { name: "Rust", hex: "#b2552b" },
  { name: "Butter", hex: "#dfb54a" },
  { name: "Blush", hex: "#dcb0a4" },
  { name: "Oxblood", hex: "#55242b" },
  { name: "Teal", hex: "#2b514d" },
];

function SwatchRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const active = SWATCHES.find((s) => s.hex === value);
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-ink-soft">
          {label}
        </span>
        <span className="font-mono text-[11px] text-ink-soft">
          {active ? `${active.name} ${active.hex}` : value}
        </span>
      </div>
      <div className="flex flex-wrap gap-2.5">
        {SWATCHES.map((s) => (
          <button
            key={s.hex}
            type="button"
            title={s.name}
            onClick={() => onChange(s.hex)}
            className={clsx(
              "h-9 w-9 rounded-full transition-transform duration-200 hover:scale-110",
              value === s.hex &&
                "ring-2 ring-flame ring-offset-2 ring-offset-bone",
            )}
            style={{ background: s.hex }}
            aria-label={`${label}: ${s.name}`}
          />
        ))}
      </div>
    </div>
  );
}

export function HarmonyLab() {
  const [a, setA] = useState("#b2552b");
  const [b, setB] = useState("#2e4070");

  const score = harmonyScore(a, b);
  const relation = relationName(a, b);
  const neutral = isNeutralHex(a) || isNeutralHex(b);
  const degrees = Math.round(hueDistanceHex(a, b));

  return (
    <section className="border-y border-line bg-paper">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28">
        <div className="mb-12 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.24em] text-flame">
              Interlude — the engine
            </p>
            <h2 className="max-w-xl font-display text-4xl leading-[1.02] tracking-tight md:text-6xl">
              Pick two colours.{" "}
              <em className="italic text-flame">Watch it think.</em>
            </h2>
          </div>
          <p className="max-w-xs text-sm leading-relaxed text-ink-soft">
            This is the same mathematics that reads your wardrobe — running
            live, on real colour-theory rules.
          </p>
        </div>

        <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-8">
            <SwatchRow label="Colour A" value={a} onChange={setA} />
            <div
              className="h-2 w-full rounded-full border border-line"
              style={{
                background: `linear-gradient(90deg, ${a}, ${b})`,
              }}
            />
            <SwatchRow label="Colour B" value={b} onChange={setB} />
            <p className="font-mono text-[11px] leading-relaxed text-ink-soft">
              Scoring runs on hue distance, neutrality and value contrast —
              the same rules a stylist uses, minus the day rate.
            </p>
          </div>

          <div className="relative flex flex-col justify-between gap-8 border border-line bg-bone p-7 shadow-[10px_10px_0_0_#17140e]">
            <div className="flex items-start justify-between gap-6">
              <div className="flex h-14">
                <span
                  className="h-14 w-14 rounded-sm border border-line"
                  style={{ background: a }}
                />
                <span
                  className="-ml-3 mt-4 h-14 w-14 rounded-sm border border-line"
                  style={{ background: b }}
                />
              </div>
              <ScoreDial value={score} size={104} stroke={7} label="harmony" />
            </div>
            <AnimatePresence mode="wait">
              <motion.div
                key={`${a}-${b}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.28 }}
              >
                <p className="font-display text-4xl italic tracking-tight md:text-5xl">
                  {relation}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-ink-soft">
                  {relationVerdict(score)}{" "}
                  {!neutral && (
                    <span className="font-mono text-[11px] uppercase tracking-[0.18em]">
                      {degrees}° apart on the wheel.
                    </span>
                  )}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
