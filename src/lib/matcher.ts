// ------------------------------------------------------------------
// The pairing engine: builds complete outfits around an anchor piece
// using colour-theory harmony, style-code overlap and value balance.
// Pure functions — deterministic and testable.
//
// Extraction note: `outfitFromSlots` / `rankSlotCandidates` are the
// same scoring paths used by `buildOutfits`, exposed so the studio UI
// can re-score user-modified fits and rank replacement candidates
// without duplicating engine logic.
// ------------------------------------------------------------------

import {
  harmonyScore,
  relationName,
  hueDistanceHex,
  hslOfHex,
  isNeutralHex,
} from "./colors";
import {
  OCCASIONS,
  titleCase,
  type Category,
  type FitSlot,
  type OutfitPick,
  type WardrobeItem,
} from "./types";

interface TemplateSlot {
  slot: Category;
  required: boolean;
}

const TEMPLATES: Record<Category, TemplateSlot[]> = {
  tops: [
    { slot: "bottoms", required: true },
    { slot: "shoes", required: true },
    { slot: "outerwear", required: false },
    { slot: "accessories", required: false },
  ],
  bottoms: [
    { slot: "tops", required: true },
    { slot: "shoes", required: true },
    { slot: "outerwear", required: false },
    { slot: "accessories", required: false },
  ],
  shoes: [
    { slot: "tops", required: true },
    { slot: "bottoms", required: true },
    { slot: "accessories", required: false },
  ],
  outerwear: [
    { slot: "tops", required: true },
    { slot: "bottoms", required: true },
    { slot: "shoes", required: true },
    { slot: "accessories", required: false },
  ],
  accessories: [
    { slot: "tops", required: true },
    { slot: "bottoms", required: true },
    { slot: "shoes", required: true },
    { slot: "outerwear", required: false },
  ],
  dresses: [
    { slot: "shoes", required: true },
    { slot: "accessories", required: false },
    { slot: "outerwear", required: false },
  ],
};

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function styleScore(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 55;
  const setA = new Set(a);
  let overlap = 0;
  for (const t of b) if (setA.has(t)) overlap++;
  if (overlap === 0) return 38;
  const denom = Math.min(a.length, b.length);
  return Math.round(62 + (overlap / denom) * 38);
}

interface PairQuality {
  harmony: number;
  style: number;
}

function pairQuality(
  anchor: WardrobeItem,
  candidate: WardrobeItem,
  boostTags: readonly string[] | null,
): PairQuality {
  const harmony = harmonyScore(anchor.colorHex, candidate.colorHex);
  let style = styleScore(anchor.tags, candidate.tags);
  if (boostTags && boostTags.some((t) => candidate.tags.includes(t))) {
    style = Math.min(100, style + 14);
  }
  return { harmony, style };
}

function lightnessBalance(items: WardrobeItem[]): number {
  const ls = items.map((i) => hslOfHex(i.colorHex).l);
  const spread = Math.max(...ls) - Math.min(...ls);
  const mean = avg(ls);
  let score = 55 + spread * 40;
  if (mean < 0.22 && spread < 0.12) score = 68; // all-dark murk
  if (mean > 0.9) score = 75; // washed out all-light
  return Math.round(Math.max(40, Math.min(97, score)));
}

function buildNotes(
  anchor: WardrobeItem,
  entries: Array<{ slot: Category; item: WardrobeItem; harmony: number }>,
  occasionLabel: string | null,
): string[] {
  const notes: string[] = [];
  const ranked = [...entries].sort((a, b) => b.harmony - a.harmony);
  for (const e of ranked.slice(0, 2)) {
    const rel = relationName(anchor.colorHex, e.item.colorHex);
    const neutral = isNeutralHex(anchor.colorHex) || isNeutralHex(e.item.colorHex);
    const deg = Math.round(hueDistanceHex(anchor.colorHex, e.item.colorHex));
    notes.push(
      `${rel} — ${anchor.colorName.toLowerCase()} × ${e.item.colorName.toLowerCase()}${
        neutral ? "." : ` (${deg}° apart on the wheel).`
      }`,
    );
  }
  for (const e of entries) {
    if (notes.length >= 4) break;
    const shared = anchor.tags.filter((t) => e.item.tags.includes(t));
    if (shared.length) {
      notes.push(
        `Shared codes with ${e.item.name}: ${shared.slice(0, 3).join(" · ")}.`,
      );
    }
  }
  if (occasionLabel && notes.length < 4) {
    notes.push(`Tuned for ${occasionLabel.toLowerCase()}.`);
  }
  return notes.slice(0, 4);
}

export interface MatchOptions {
  occasion?: string | null;
  limit?: number;
  /** optional id prefix for generated outfits */
  idPrefix?: string;
}

export interface MatchResult {
  outfits: OutfitPick[];
  missing: Category[];
}

// -------------------- shared scoring (single source of truth) -------

/**
 * Scores an explicit anchor + slot selection. Used both by the engine
 * (for its generated combos) and by the studio UI (for user edits),
 * so both paths always agree on numbers.
 */
export function outfitFromSlots(
  anchor: WardrobeItem,
  slots: FitSlot[],
  options: MatchOptions = {},
): OutfitPick {
  const occasion = OCCASIONS.find((o) => o.id === options.occasion) ?? null;
  const boostTags = occasion ? occasion.tags : null;
  const occasionLabel = occasion ? occasion.label : null;

  const withHarmony: FitSlot[] = slots.map((s) => ({
    ...s,
    harmony: s.item ? harmonyScore(anchor.colorHex, s.item.colorHex) : null,
  }));

  const entries: Array<{
    slot: Category;
    item: WardrobeItem;
    harmony: number;
    style: number;
  }> = [];
  for (const s of withHarmony) {
    if (!s.item) continue;
    const q = pairQuality(anchor, s.item, boostTags);
    entries.push({ slot: s.slot, item: s.item, harmony: q.harmony, style: q.style });
  }

  const anchorHarmony = avg(entries.map((e) => e.harmony));
  const cross: number[] = [];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      cross.push(harmonyScore(entries[i].item.colorHex, entries[j].item.colorHex));
    }
  }
  const color = Math.round(
    anchorHarmony * 0.65 + (cross.length ? avg(cross) : anchorHarmony) * 0.35,
  );
  const style = Math.round(avg(entries.map((e) => e.style)));
  const allPieces = [anchor, ...entries.map((e) => e.item)];
  const balance = lightnessBalance(allPieces);
  const score = Math.round(color * 0.55 + style * 0.25 + balance * 0.2);

  const headline = titleCase(
    allPieces.map((i) => i.colorName.toLowerCase()).join(" + "),
  );

  const sig = entries.map((e) => e.item.id.slice(0, 4)).join("");

  return {
    id: `${options.idPrefix ?? "fit"}-${sig}`,
    slots: withHarmony,
    score,
    breakdown: { color, style, balance },
    headline,
    notes: buildNotes(anchor, entries, occasionLabel),
  };
}

// ----------------------- slot candidate ranking ---------------------

export interface SlotCandidate {
  item: WardrobeItem;
  harmony: number;
  style: number;
  score: number;
}

/**
 * Ranks every wardrobe piece eligible for a slot against the anchor —
 * same weighting the engine uses when assembling fits.
 */
export function rankSlotCandidates(
  anchor: WardrobeItem,
  wardrobe: WardrobeItem[],
  slot: Category,
  options: MatchOptions = {},
): SlotCandidate[] {
  const occasion = OCCASIONS.find((o) => o.id === options.occasion) ?? null;
  const boostTags = occasion ? occasion.tags : null;

  return wardrobe
    .filter((i) => i.id !== anchor.id && i.category === slot)
    .map((item) => {
      const q = pairQuality(anchor, item, boostTags);
      return {
        item,
        harmony: q.harmony,
        style: q.style,
        score: Math.round(q.harmony * 0.62 + q.style * 0.38),
      };
    })
    .sort((a, b) => b.score - a.score);
}

// ----------------------------- the engine ---------------------------

export function buildOutfits(
  anchor: WardrobeItem,
  wardrobe: WardrobeItem[],
  options: MatchOptions = {},
): MatchResult {
  const limit = options.limit ?? 3;
  const pool = wardrobe.filter((i) => i.id !== anchor.id);
  const template = TEMPLATES[anchor.category];

  // Rank candidates per slot (shared with the studio's replace flow).
  const rankedBySlot = new Map<Category, WardrobeItem[]>();
  for (const { slot } of template) {
    rankedBySlot.set(
      slot,
      rankSlotCandidates(anchor, wardrobe, slot, options).map((c) => c.item),
    );
  }

  const missing = template
    .filter((t) => t.required && (rankedBySlot.get(t.slot)?.length ?? 0) === 0)
    .map((t) => t.slot);

  // Assemble variants: v=0 best-of-slot, later variants rotate runners-up in.
  const combos: Array<Partial<Record<Category, WardrobeItem | null>>> = [];
  const seen = new Set<string>();
  for (let v = 0; v < 6 && combos.length < limit; v++) {
    const combo: Partial<Record<Category, WardrobeItem | null>> = {};
    let hasAny = false;
    for (let i = 0; i < template.length; i++) {
      const ranked = rankedBySlot.get(template[i].slot) ?? [];
      const pick =
        ranked[Math.min(Math.max(v - i, 0), Math.max(ranked.length - 1, 0))] ??
        null;
      combo[template[i].slot] = pick;
      if (pick) hasAny = true;
    }
    if (!hasAny) continue;
    const sig = Object.values(combo)
      .filter((x): x is WardrobeItem => Boolean(x))
      .map((x) => x.id)
      .sort()
      .join("|");
    if (seen.has(sig)) continue;
    seen.add(sig);
    combos.push(combo);
  }

  const outfits: OutfitPick[] = combos.map((combo, idx) => {
    const slots: FitSlot[] = template.map(({ slot, required }) => ({
      slot,
      required,
      item: combo[slot] ?? null,
      harmony: null,
    }));
    return outfitFromSlots(anchor, slots, {
      ...options,
      idPrefix: `fit-${idx}`,
    });
  });

  outfits.sort((a, b) => b.score - a.score);
  return { outfits, missing };
}
