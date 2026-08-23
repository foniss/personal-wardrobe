"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  Asterisk,
  Camera,
  MousePointerClick,
  Sparkles,
} from "lucide-react";
import { HarmonyLab } from "@/components/harmony-lab";
import { ScoreDial } from "@/components/score-dial";
import type { WardrobeItem } from "@/lib/types";

const fadeUp = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const },
};

function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  const [pieces, setPieces] = useState<WardrobeItem[]>([]);

  useEffect(() => {
    fetch("/api/items")
      .then((r) => r.json())
      .then((d) => setPieces((d.items ?? []).slice(0, 3)))
      .catch(() => {});
  }, []);

  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 55, damping: 16 });
  const sy = useSpring(my, { stiffness: 55, damping: 16 });
  const f1x = useTransform(sx, (v) => v * 20);
  const f1y = useTransform(sy, (v) => v * 14);
  const f2x = useTransform(sx, (v) => v * -14);
  const f2y = useTransform(sy, (v) => v * -10);
  const f3x = useTransform(sx, (v) => v * 8);
  const f3y = useTransform(sy, (v) => v * 18);

  return (
    <section
      ref={ref}
      onMouseMove={(e) => {
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        mx.set((e.clientX - r.left) / r.width - 0.5);
        my.set((e.clientY - r.top) / r.height - 0.5);
      }}
      className="relative overflow-hidden pt-14"
    >
      <div className="mx-auto grid max-w-6xl gap-14 px-4 pb-16 pt-14 sm:px-6 md:pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10 lg:pb-24">
        {/* Left — the pitch */}
        <div className="flex flex-col justify-center">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-7 flex items-center gap-3"
          >
            <span className="h-2 w-2 rounded-full bg-flame" />
            <span className="font-mono text-[11px] uppercase tracking-[0.26em] text-ink-soft">
              The intelligent wardrobe — vol. 01
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 34 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, delay: 0.08 }}
            className="font-display text-[17vw] leading-[0.94] tracking-tight sm:text-7xl md:text-8xl"
          >
            Stop
            <br />
            guessing.
            <br />
            <em className="italic text-flame">Start pairing.</em>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="mt-7 max-w-md text-base leading-relaxed text-ink-soft md:text-lg"
          >
            Photograph your wardrobe once. Anchor any piece — a shirt, a boot,
            a bag — and the harmony engine reads the colour of every thread to
            build the fits that actually work.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.32 }}
            className="mt-9 flex flex-wrap items-center gap-4"
          >
            <Link
              href="/wardrobe"
              className="group inline-flex items-center gap-2.5 rounded-full bg-ink px-7 py-4 font-mono text-xs uppercase tracking-[0.18em] text-bone transition-colors hover:bg-flame"
            >
              Open the wardrobe
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
            <Link
              href="/match"
              className="inline-flex items-center gap-2 rounded-full border border-ink/25 px-7 py-4 font-mono text-xs uppercase tracking-[0.18em] text-ink transition-colors hover:border-ink hover:bg-bone-deep"
            >
              Pair a fit
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="mt-12 flex divide-x divide-line border-y border-line"
          >
            {[
              ["33", "colour families"],
              ["12", "style codes"],
              ["03", "fits per anchor"],
            ].map(([n, label]) => (
              <div key={label} className="flex-1 px-4 py-4 first:pl-0">
                <p className="font-display text-2xl md:text-3xl">{n}</p>
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                  {label}
                </p>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Right — the collage */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.15 }}
          className="relative mx-auto w-full max-w-md lg:max-w-none"
        >
          <div className="relative border border-line bg-paper p-3 shadow-[14px_14px_0_0_#17140e]">
            <div className="relative aspect-[4/5] overflow-hidden bg-bone-deep">
              <img
                src="/images/hero.jpg"
                alt="Editorial look — sand trench, rust knit, indigo denim"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="flex items-center justify-between px-1 pt-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft">
                Look nº01 — sand × rust × indigo
              </span>
              <Asterisk className="h-4 w-4 text-flame" />
            </div>
          </div>

          {/* floating score sticker */}
          <motion.div
            style={{ x: f1x, y: f1y }}
            className="absolute -right-4 -top-6 rotate-6 border border-line bg-paper p-3 shadow-[8px_8px_0_0_#17140e] md:-right-8"
          >
            <ScoreDial value={94} size={92} stroke={7} label="harmony" />
          </motion.div>

          {/* floating palette readout */}
          <motion.div
            style={{ x: f2x, y: f2y }}
            className="absolute -left-4 bottom-16 -rotate-3 border border-line bg-paper px-4 py-3 shadow-[8px_8px_0_0_#17140e] md:-left-10"
          >
            <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-ink-soft">
              Palette readout
            </p>
            <div className="flex gap-1.5">
              {["#cbb18c", "#b2552b", "#2e4070", "#f0ead9", "#17140e"].map(
                (c) => (
                  <span
                    key={c}
                    className="h-6 w-6 rounded-sm border border-line"
                    style={{ background: c }}
                  />
                ),
              )}
            </div>
          </motion.div>

          {/* floating wardrobe thumbs */}
          <motion.div
            style={{ x: f3x, y: f3y }}
            className="absolute -bottom-8 right-6 flex -space-x-4"
          >
            {pieces.slice(0, 3).map((p, i) => (
              <div
                key={p.id}
                className="h-20 w-20 overflow-hidden rounded-full border-2 border-bone bg-bone-deep shadow-[5px_5px_0_0_#17140e]"
                style={{ transform: `rotate(${i * 8 - 8}deg)` }}
              >
                <img
                  src={p.imagePath}
                  alt={p.name}
                  className="h-full w-full object-cover"
                />
              </div>
            ))}
          </motion.div>
        </motion.div>
      </div>

      {/* marquee */}
      <div className="overflow-hidden border-y border-line bg-paper py-3.5">
        <div className="animate-marquee flex w-max items-center gap-8 pr-8">
          {[0, 1].map((dup) => (
            <div key={dup} className="flex items-center gap-8" aria-hidden={dup === 1}>
              {[
                "Complementary",
                "Analogous",
                "Tonal",
                "Triadic",
                "Neutral ground",
                "Contrast play",
                "Anchored neutral",
              ].map((word) => (
                <span key={`${dup}-${word}`} className="flex items-center gap-8">
                  <span className="whitespace-nowrap font-mono text-xs uppercase tracking-[0.3em] text-ink-soft">
                    {word}
                  </span>
                  <Asterisk className="h-4 w-4 shrink-0 text-flame" />
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  {
    index: "01",
    title: "Snap it",
    icon: Camera,
    body: "Shoot a piece on any background. We pull its palette straight off the pixels — no spreadsheet required.",
  },
  {
    index: "02",
    title: "Anchor it",
    icon: MousePointerClick,
    body: "Pick the one thing you actually want to wear today. A shirt, a boot, a tote — anything can start a fit.",
  },
  {
    index: "03",
    title: "Pair it",
    icon: Sparkles,
    body: "The engine scores every combination on the colour wheel, weighted by your style codes. Top three fits, served.",
  },
];

function Steps() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28">
      <motion.p {...fadeUp} className="mb-3 font-mono text-[11px] uppercase tracking-[0.24em] text-flame">
        The method
      </motion.p>
      <motion.h2
        {...fadeUp}
        className="max-w-2xl font-display text-4xl leading-[1.02] tracking-tight md:text-6xl"
      >
        Three moves to <em className="italic">dressed.</em>
      </motion.h2>

      <div className="mt-14 grid gap-px overflow-hidden border border-line bg-line md:grid-cols-3">
        {STEPS.map((step, i) => (
          <motion.article
            key={step.index}
            initial={{ opacity: 0, y: 26 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.6, delay: i * 0.12 }}
            className="group relative bg-bone p-7 transition-colors hover:bg-paper"
          >
            <div className="mb-10 flex items-start justify-between">
              <span className="font-display text-5xl italic text-ink/15 transition-colors duration-300 group-hover:text-flame">
                {step.index}
              </span>
              <span className="flex h-11 w-11 items-center justify-center rounded-full border border-line transition-colors duration-300 group-hover:border-flame group-hover:bg-flame group-hover:text-bone">
                <step.icon className="h-5 w-5" strokeWidth={1.8} />
              </span>
            </div>
            <h3 className="font-display text-2xl italic tracking-tight">
              {step.title}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">
              {step.body}
            </p>
          </motion.article>
        ))}
      </div>
    </section>
  );
}

function CtaBand() {
  return (
    <section className="bg-ink text-bone">
      <div className="mx-auto max-w-6xl px-4 py-24 text-center sm:px-6 md:py-32">
        <motion.p
          {...fadeUp}
          className="mb-5 font-mono text-[11px] uppercase tracking-[0.26em] text-flame"
        >
          Ready when you are
        </motion.p>
        <motion.h2
          {...fadeUp}
          className="mx-auto max-w-3xl font-display text-5xl leading-[0.98] tracking-tight md:text-7xl"
        >
          Wear it like <em className="italic text-flame">you meant it.</em>
        </motion.h2>
        <motion.div {...fadeUp} className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/wardrobe"
            className="group inline-flex items-center gap-2.5 rounded-full bg-flame px-8 py-4 font-mono text-xs uppercase tracking-[0.18em] text-bone transition-colors hover:bg-bone hover:text-ink"
          >
            Build your wardrobe
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-bone/50">
            Free · Local · Yours
          </span>
        </motion.div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line bg-ink pb-8 pt-6 text-bone">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 font-mono text-[10px] uppercase tracking-[0.2em] text-bone/45 sm:flex-row sm:px-6">
        <span className="flex items-center gap-1.5">
          <Asterisk className="h-3.5 w-3.5 text-flame" /> fitcheck © 2026
        </span>
        <span>harmony engine v2 — built on the colour wheel</span>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  return (
    <main>
      <Hero />
      <Steps />
      <HarmonyLab />
      <CtaBand />
      <Footer />
    </main>
  );
}
