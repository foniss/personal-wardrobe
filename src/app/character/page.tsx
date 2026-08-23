"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, Loader2, RotateCcw, Save, UserRound } from "lucide-react";
import { Avatar } from "@/avatar/avatar";
import {
  BUILDS,
  DEFAULT_CHARACTER,
  GENDERS,
  SKIN_TONES,
  HAIRSTYLES,
  type CharacterParams,
} from "@/avatar/params";
import { CharacterControls } from "@/components/character-form";
import { Toast } from "@/components/toast";
import type { Category, WardrobeItem } from "@/lib/types";

export default function CharacterPage() {
  const [saved, setSaved] = useState<CharacterParams>(DEFAULT_CHARACTER);
  const [draft, setDraft] = useState<CharacterParams>(DEFAULT_CHARACTER);
  const [configured, setConfigured] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [items, setItems] = useState<WardrobeItem[]>([]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/character").then((r) => r.json()),
      fetch("/api/items").then((r) => r.json()),
    ])
      .then(([charData, itemsData]) => {
        const c: CharacterParams = charData.character ?? DEFAULT_CHARACTER;
        setSaved(c);
        setDraft(c);
        setConfigured(Boolean(charData.configured));
        setItems(itemsData.items ?? []);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // the preview tries on a sample from the wardrobe, when it exists
  const sampleOutfit = useMemo(() => {
    const pick = (c: Category) => items.find((i) => i.category === c);
    return [
      pick("tops"),
      pick("bottoms"),
      pick("shoes"),
      pick("outerwear"),
      pick("accessories"),
    ].filter((x): x is WardrobeItem => Boolean(x));
  }, [items]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/character", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save.");
      setSaved(data.character);
      setDraft(data.character);
      setConfigured(true);
      showToast("Character saved — try on a fit");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setDraft(DEFAULT_CHARACTER);
  }

  const genderLabel = GENDERS.find((g) => g.id === draft.gender)?.label ?? "";
  const buildLabel = BUILDS.find((b) => b.id === draft.build)?.label ?? "";
  const skinLabel = SKIN_TONES.find((t) => t.id === draft.skinTone)?.label ?? "";
  const hairLabel =
    HAIRSTYLES.find((h) => h.id === draft.hairstyle)?.label ?? "";

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-14 sm:px-6">
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-line pb-8 pt-10">
        <div>
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.26em] text-flame">
            {configured ? "Saved profile" : "Unsaved draft"}
          </p>
          <h1 className="font-display text-5xl tracking-tight md:text-7xl">
            Your <em className="italic">character</em>
          </h1>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-ink-soft">
            This is who tries on every fit the engine builds. Tune the frame,
            the hair, the details — it updates live.
          </p>
        </div>
        <Link
          href="/match"
          className="inline-flex items-center gap-2 rounded-full border border-ink/25 px-6 py-3.5 font-mono text-[11px] uppercase tracking-[0.18em] transition-colors hover:border-ink hover:bg-bone-deep"
        >
          To the match studio
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_400px] lg:gap-14">
        {/* controls — left on desktop, below on mobile */}
        <div className="order-2 lg:order-1">
          {loaded ? (
            <CharacterControls
              value={draft}
              onChange={(next) => setDraft(next)}
            />
          ) : (
            <div className="space-y-8">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="animate-soft-pulse">
                  <div className="h-3 w-24 bg-bone-deep" />
                  <div className="mt-3 h-8 w-2/3 rounded-full bg-bone-deep" />
                </div>
              ))}
            </div>
          )}

          {error && (
            <p className="mt-6 border border-flame/50 bg-flame/5 px-3.5 py-2.5 text-xs text-flame">
              {error}
            </p>
          )}

          <div className="mt-10 flex flex-wrap gap-3 lg:hidden">
            <button
              type="button"
              onClick={save}
              disabled={saving || !dirty}
              className="inline-flex flex-1 items-center justify-center gap-2.5 rounded-full bg-flame px-6 py-3.5 font-mono text-[11px] uppercase tracking-[0.18em] text-bone transition-colors hover:bg-ink disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save character
            </button>
          </div>
        </div>

        {/* live preview — right on desktop, top on mobile */}
        <div className="order-1 lg:order-2">
          <div className="lg:sticky lg:top-20">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="border border-line bg-paper p-4 shadow-[12px_12px_0_0_#17140e]"
            >
              <div className="mx-auto max-w-[340px]">
                <Avatar
                  character={draft}
                  items={sampleOutfit}
                  title="Your character wearing a sample fit"
                />
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-line px-1 pt-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                  {genderLabel} · {draft.heightCm} cm · {buildLabel}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                  {skinLabel} · {hairLabel}
                  {draft.glasses ? " · glasses" : ""}
                </span>
              </div>
              {sampleOutfit.length > 0 && (
                <p className="mt-2 truncate px-1 font-mono text-[10px] text-ink/45">
                  Trying on: {sampleOutfit.map((i) => i.name).join(" · ")}
                </p>
              )}
            </motion.div>

            <div className="mt-5 hidden gap-3 lg:flex">
              <button
                type="button"
                onClick={save}
                disabled={saving || !dirty}
                className="inline-flex flex-1 items-center justify-center gap-2.5 rounded-full bg-flame px-6 py-3.5 font-mono text-[11px] uppercase tracking-[0.18em] text-bone transition-colors hover:bg-ink disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {dirty ? "Save character" : "Saved"}
              </button>
              <button
                type="button"
                onClick={reset}
                title="Reset to defaults"
                aria-label="Reset to defaults"
                className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-line transition-colors hover:border-ink/50"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-4 hidden items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-ink/40 lg:flex">
              <UserRound className="h-3.5 w-3.5" />
              Saved characters persist across visits
            </p>
          </div>
        </div>
      </div>

      <Toast toast={toast} />
    </main>
  );
}
