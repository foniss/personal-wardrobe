"use client";

import Link from "next/link";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import {
  ArrowLeft,
  ArrowUpRight,
  Asterisk,
  Bookmark,
  ChevronDown,
  Layers,

  Loader2,
  RefreshCcw,
  Shirt,
  Shuffle,
  Sparkles,
  Trash2,
  UserRound,
} from "lucide-react";
import { Avatar } from "@/avatar/avatar";
import { DEFAULT_CHARACTER, type CharacterParams } from "@/avatar/params";
import { ScoreDial } from "@/components/score-dial";
import { Toast } from "@/components/toast";
import {
  TryOnStage,
  useTryOn,
  type ProviderInfo,
} from "@/components/tryon-panel";
import { useVtonStatus } from "@/components/vton-status";
import { outfitFromSlots, rankSlotCandidates } from "@/lib/matcher";
import {
  CATEGORY_LABEL,
  CATEGORY_SINGLE,
  OCCASIONS,
  type Category,
  type MatchResponse,
  type SavedOutfit,
  type WardrobeItem,
} from "@/lib/types";

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft">
          {label}
        </span>
        <span className="font-mono text-[11px]">{value}/100</span>
      </div>
      <div className="h-1 w-full bg-ink/10">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="h-full bg-flame"
        />
      </div>
    </div>
  );
}

// ------------------------------------------------------- slot replace row

function SlotRow({
  slotLabel,
  required,
  item,
  harmony,
  expanded,
  candidates,
  placedId,
  onToggle,
  onSwap,
}: {
  slotLabel: string;
  required: boolean;
  item: WardrobeItem | null;
  harmony: number | null;
  expanded: boolean;
  candidates: Array<{ item: WardrobeItem; score: number; harmony: number }>;
  placedId: string | null;
  onToggle: () => void;
  onSwap: (item: WardrobeItem) => void;
}) {
  if (!item) {
    return (
      <Link
        href="/wardrobe?upload=1"
        className="flex items-center justify-center gap-2 border border-dashed border-ink/30 bg-bone-deep/40 px-5 py-5 text-center transition-colors hover:border-flame/60"
      >
        <Shirt className="h-4 w-4 text-ink-soft" strokeWidth={1.6} />
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">
          No {slotLabel.toLowerCase()} yet
          {required && <span className="text-flame"> — needed</span>}
          <span className="text-flame"> · add one</span>
        </span>
      </Link>
    );
  }

  return (
    <div className="border border-line bg-paper transition-shadow hover:shadow-[5px_5px_0_0_#17140e]">
      <button
        type="button"
        onClick={onToggle}
        className={clsx(
          "flex w-full items-center gap-3.5 p-2.5 text-left",
          expanded && "border-b border-line",
        )}
      >
        <span className="relative h-14 w-14 shrink-0 overflow-hidden border border-line bg-bone-deep">
          <img
            src={item.imagePath}
            alt={item.name}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-[9px] uppercase tracking-[0.18em] text-ink-soft">
            {slotLabel}
            {!required && <span className="text-ink/40"> · opt</span>}
          </span>
          <span className="block truncate text-sm font-medium leading-tight">
            {item.name}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-ink-soft">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full border border-line"
              style={{ background: item.colorHex }}
            />
            {item.colorName}
          </span>
        </span>
        {harmony !== null && (
          <ScoreDial value={harmony} size={44} stroke={4} label="" />
        )}
        <span
          className={clsx(
            "inline-flex items-center gap-1 rounded-full border px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] transition-colors",
            expanded
              ? "border-flame bg-flame text-bone"
              : "border-line text-ink-soft hover:border-ink/50 hover:text-ink",
          )}
        >
          Replace
          <ChevronDown
            className={clsx(
              "h-3 w-3 transition-transform duration-300",
              expanded && "rotate-180",
            )}
          />
        </span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="max-h-56 overflow-y-auto">
              {candidates.length === 0 ? (
                <p className="px-4 py-4 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">
                  No other {slotLabel.toLowerCase()} in the wardrobe
                </p>
              ) : (
                candidates.map((c) => {
                  const wearing = c.item.id === placedId;
                  return (
                    <button
                      key={c.item.id}
                      type="button"
                      disabled={wearing}
                      onClick={() => onSwap(c.item)}
                      className={clsx(
                        "flex w-full items-center gap-3 border-b border-line/60 px-3.5 py-2.5 text-left transition-colors last:border-b-0",
                        wearing
                          ? "bg-flame/5"
                          : "hover:bg-bone-deep/70",
                      )}
                    >
                      <span className="h-10 w-10 shrink-0 overflow-hidden border border-line bg-bone-deep">
                        <img
                          src={c.item.imagePath}
                          alt={c.item.name}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium leading-tight">
                          {c.item.name}
                        </span>
                        <span className="font-mono text-[10px] text-ink-soft">
                          {c.item.colorName}
                        </span>
                      </span>
                      {wearing ? (
                        <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-flame">
                          Wearing
                        </span>
                      ) : (
                        <span
                          className={clsx(
                            "border px-2 py-0.5 font-mono text-[10px]",
                            c.harmony >= 85
                              ? "border-flame/60 text-flame"
                              : "border-line text-ink-soft",
                          )}
                        >
                          {c.harmony}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ------------------------------------------------------------- the studio

function MatchStudio() {
  const searchParams = useSearchParams();
  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [anchorId, setAnchorId] = useState<string | null>(
    searchParams.get("anchor"),
  );
  const [occasion, setOccasion] = useState<string>("everyday");
  const [match, setMatch] = useState<MatchResponse | null>(null);
  const [matchLoading, setMatchLoading] = useState(false);
  const [fitIdx, setFitIdx] = useState(0);
  const [saved, setSaved] = useState<SavedOutfit[]>([]);
  const [naming, setNaming] = useState(false);
  const [fitName, setFitName] = useState("");
  const [savingFit, setSavingFit] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [character, setCharacter] = useState<CharacterParams>(DEFAULT_CHARACTER);
  const [characterConfigured, setCharacterConfigured] = useState(false);
  const [userModel, setUserModel] = useState<{
    id: string;
    type: string;
    imageUrl: string | null;
  } | null>(null);
  const [provider, setProvider] = useState<ProviderInfo | null>(null);
  const [view, setView] = useState("front");
  const [showSchematic, setShowSchematic] = useState(false);
  const [overrides, setOverrides] = useState<Partial<Record<Category, WardrobeItem>>>({});
  const [expandSlot, setExpandSlot] = useState<Category | null>(null);

  const {
    status: vtonStatus,
    refresh: refreshVtonStatus,
  } = useVtonStatus(15000);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/items").then((r) => r.json()),
      fetch("/api/outfits").then((r) => r.json()),
      fetch("/api/character").then((r) => r.json()),
      fetch("/api/model").then((r) => r.json()),
    ])
      .then(([itemsData, outfitsData, charData, modelData]) => {
        const list: WardrobeItem[] = itemsData.items ?? [];
        setItems(list);
        setSaved(outfitsData.outfits ?? []);
        if (charData.character) setCharacter(charData.character);
        setCharacterConfigured(Boolean(charData.configured));
        setUserModel(modelData.model ?? null);
        setProvider(modelData.provider ?? null);
        setAnchorId((cur) =>
          cur && list.some((i) => i.id === cur) ? cur : (list[0]?.id ?? null),
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!anchorId) return;
    let cancelled = false;
    setMatchLoading(true);
    fetch("/api/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anchorId, occasion }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setMatch(data.error ? null : (data as MatchResponse));
        setFitIdx(0);
        setNaming(false);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setMatchLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [anchorId, occasion]);

  const anchor = match?.anchor ?? items.find((i) => i.id === anchorId) ?? null;
  const fits = match?.outfits ?? [];
  const baseFit = fits[Math.min(fitIdx, fits.length - 1)] ?? null;

  // user swaps reset whenever the underlying fit changes
  useEffect(() => {
    setOverrides({});
    setExpandSlot(null);
  }, [anchorId, occasion, fitIdx]);

  // displayed fit = engine fit + user swaps, re-scored by the same engine math
  const fit = useMemo(() => {
    if (!baseFit || !anchor) return null;
    const hasOverrides = Object.keys(overrides).length > 0;
    if (!hasOverrides) return baseFit;
    const slots = baseFit.slots.map((s) =>
      overrides[s.slot] !== undefined
        ? { ...s, item: overrides[s.slot] ?? null }
        : s,
    );
    return outfitFromSlots(anchor, slots, {
      occasion,
      idPrefix: baseFit.id,
    });
  }, [baseFit, anchor, overrides, occasion]);

  const wornItems = useMemo(() => {
    if (!anchor || !fit) return anchor ? [anchor] : [];
    return [
      anchor,
      ...fit.slots
        .map((s) => s.item)
        .filter((x): x is WardrobeItem => Boolean(x)),
    ];
  }, [anchor, fit]);

  // try-on is keyed on the EXACT worn item ids, so replacing a single
  // piece automatically looks up / regenerates the right visualization.
  const wornIds = useMemo(() => wornItems.map((i) => i.id), [wornItems]);
  const tryOn = useTryOn(wornIds, view);

  // candidates per slot for the replace accordion (memoized per inputs)
  const candidateMap = useMemo(() => {
    const map = new Map<
      Category,
      Array<{ item: WardrobeItem; score: number; harmony: number }>
    >();
    if (!anchor || !fit) return map;
    const wornIds = new Set([
      anchor.id,
      ...fit.slots.filter((s) => s.item).map((s) => s.item!.id),
    ]);
    for (const s of fit.slots) {
      map.set(
        s.slot,
        rankSlotCandidates(anchor, items, s.slot, { occasion })
          .filter((c) => !wornIds.has(c.item.id) || c.item.id === s.item?.id)
          .slice(0, 5),
      );
    }
    return map;
  }, [anchor, fit, items, occasion]);

  const pieceById = useMemo(
    () => new Map(items.map((i) => [i.id, i])),
    [items],
  );

  const overrideCount = Object.keys(overrides).length;

  function shuffle() {
    if (items.length < 2) return;
    const others = items.filter((i) => i.id !== anchorId);
    setAnchorId(others[Math.floor(Math.random() * others.length)].id);
  }

  function swap(slot: Category, item: WardrobeItem) {
    setOverrides((cur) => ({ ...cur, [slot]: item }));
    setExpandSlot(null);
  }

  async function saveFit() {
    if (!fit || !anchor) return;
    setSavingFit(true);
    try {
      const res = await fetch("/api/outfits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fitName.trim() || `Fit nº${saved.length + 1}`,
          occasion,
          anchorId: anchor.id,
          itemIds: [
            anchor.id,
            ...fit.slots.map((s) => s.item?.id).filter(Boolean),
          ],
          score: fit.score,
          headline: fit.headline,
          tryOnResultId:
            tryOn.result?.status === "done" ? tryOn.result.id : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setSaved((cur) => [data.outfit, ...cur]);
      setNaming(false);
      setFitName("");
      showToast("Logged to the lookbook");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingFit(false);
    }
  }

  async function removeSaved(id: string) {
    setSaved((cur) => cur.filter((o) => o.id !== id));
    try {
      await fetch(`/api/outfits/${id}`, { method: "DELETE" });
      showToast("Fit removed");
    } catch {
      /* already gone visually */
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-14 sm:px-6">
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-line pb-8 pt-10">
        <div>
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.26em] text-flame">
            The pairing desk
          </p>
          <h1 className="font-display text-5xl tracking-tight md:text-7xl">
            Pick a piece. <em className="italic">Get the fit.</em>
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-soft">
            Choose an anchor below — the engine scores every piece you own
            against it, builds the strongest outfits, and your character tries
            them on.
          </p>
        </div>
        {items.length > 1 && (
          <button
            type="button"
            onClick={shuffle}
            className="inline-flex items-center gap-2.5 rounded-full border border-ink/25 px-6 py-3.5 font-mono text-[11px] uppercase tracking-[0.18em] transition-colors hover:border-ink hover:bg-bone-deep"
          >
            <Shuffle className="h-4 w-4" />
            Shuffle anchor
          </button>
        )}
      </div>

      {loading ? (
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <div className="aspect-[4/5] animate-soft-pulse border border-line bg-bone-deep" />
          <div className="space-y-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-24 animate-soft-pulse border border-line bg-bone-deep"
              />
            ))}
          </div>
        </div>
      ) : items.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-12 flex flex-col items-center border border-dashed border-ink/30 px-6 py-20 text-center"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full border border-line">
            <Shirt className="h-6 w-6 text-ink-soft" strokeWidth={1.6} />
          </span>
          <h2 className="mt-6 font-display text-3xl italic tracking-tight">
            Nothing to pair yet.
          </h2>
          <p className="mt-2 max-w-xs text-sm text-ink-soft">
            The engine needs fabric to think with. Add your first pieces and
            come back.
          </p>
          <Link
            href="/wardrobe?upload=1"
            className="mt-7 inline-flex items-center gap-2.5 rounded-full bg-ink px-7 py-3.5 font-mono text-[11px] uppercase tracking-[0.18em] text-bone transition-colors hover:bg-flame"
          >
            Open the wardrobe
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </motion.div>
      ) : (
        <>
          {/* anchor rail */}
          <section className="mt-8">
            <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
              Anchor —{" "}
              {anchor ? (
                <span className="text-flame">
                  {CATEGORY_LABEL[anchor.category]} · {anchor.name}
                </span>
              ) : (
                "—"
              )}
            </p>
            <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
              {items.map((item) => {
                const active = item.id === anchorId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setAnchorId(item.id)}
                    className={clsx(
                      "w-24 shrink-0 text-left transition-all duration-300",
                      active ? "-translate-y-1" : "opacity-70 hover:opacity-100",
                    )}
                  >
                    <span
                      className={clsx(
                        "block aspect-square overflow-hidden border bg-bone-deep",
                        active
                          ? "border-flame shadow-[4px_4px_0_0_#17140e]"
                          : "border-line",
                      )}
                    >
                      <img
                        src={item.imagePath}
                        alt={item.name}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    </span>
                    <span
                      className={clsx(
                        "mt-1.5 block truncate font-mono text-[10px]",
                        active ? "text-ink" : "text-ink-soft",
                      )}
                    >
                      {item.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* occasions */}
          <section className="mt-6 flex flex-wrap items-center gap-2">
            <span className="mr-2 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
              Occasion
            </span>
            {OCCASIONS.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setOccasion(o.id)}
                className={clsx(
                  "rounded-full border px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors",
                  occasion === o.id
                    ? "border-ink bg-ink text-bone"
                    : "border-line hover:border-ink/50",
                )}
              >
                {o.label}
              </button>
            ))}
          </section>

          {/* outfit showcase */}
          <div
            className={clsx(
              "mt-10 grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-10",
              matchLoading && "pointer-events-none opacity-60 transition-opacity",
            )}
          >
            {/* realistic try-on — the centrepiece */}
            <div>
              {fit && anchor && (
                <>
                  <TryOnStage
                    provider={provider}
                    hasModel={Boolean(userModel?.imageUrl)}
                    modelImageUrl={userModel?.imageUrl ?? null}
                    result={tryOn.result}
                    busy={tryOn.busy}
                    error={tryOn.error}
                    onGenerate={tryOn.generate}
                    view={view}
                    onViewChange={setView}
                    itemCount={wornItems.length}
                    vtonStatus={vtonStatus}
                    onRefreshStatus={refreshVtonStatus}
                  />

                  {/* schematic fallback — instant, offline, secondary */}
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => setShowSchematic((v) => !v)}
                      className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-ink/45 transition-colors hover:text-ink"
                    >
                      <Layers className="h-3.5 w-3.5" />
                      {showSchematic ? "Hide" : "Show"} schematic preview
                    </button>
                    <AnimatePresence>
                      {showSchematic && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-3 border border-line bg-paper p-3">
                            <div className="mx-auto max-w-[260px]">
                              <Avatar
                                character={character}
                                items={wornItems}
                                title={`Schematic preview of ${fit.headline}`}
                              />
                            </div>
                            <p className="mt-2 text-center font-mono text-[9px] uppercase tracking-[0.16em] text-ink/40">
                              Instant colour/proportion sketch — not the AI result
                            </p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
                    <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">
                      Anchor: <span className="text-ink">{anchor.name}</span>{" "}
                      · reads as “{anchor.colorName}”
                    </p>
                    <span className="flex gap-1.5">
                      {anchor.palette.slice(0, 5).map((hex) => (
                        <span
                          key={hex}
                          title={hex}
                          className="h-4 w-4 rounded-sm border border-line"
                          style={{ background: hex }}
                        />
                      ))}
                    </span>
                  </div>

                  <Link
                    href="/model"
                    className="mt-4 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft transition-colors hover:text-flame"
                  >
                    <UserRound className="h-4 w-4" />
                    {userModel?.imageUrl
                      ? `Change my model (${userModel.type})`
                      : "Set up my model"}
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </>
              )}
            </div>

            {/* fit board */}
            <div>
              {matchLoading && !fit ? (
                <div className="space-y-5">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-28 animate-soft-pulse border border-line bg-bone-deep"
                    />
                  ))}
                </div>
              ) : !fit ? (
                <div className="flex flex-col items-center border border-dashed border-ink/30 px-6 py-16 text-center">
                  <p className="font-display text-2xl italic">
                    No pairings possible yet.
                  </p>
                  <p className="mt-2 max-w-xs text-sm text-ink-soft">
                    Add pieces in other categories so the engine has something
                    to pair with this anchor.
                  </p>
                  <Link
                    href="/wardrobe?upload=1"
                    className="mt-6 inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 font-mono text-[11px] uppercase tracking-[0.18em] text-bone hover:bg-flame"
                  >
                    Add pieces <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </div>
              ) : (
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${anchor?.id}-${occasion}-${fitIdx}`}
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.35 }}
                  >
                    <div className="flex items-start justify-between gap-6">
                      <div>
                        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-flame">
                          Fit nº {String(fitIdx + 1).padStart(2, "0")} — of{" "}
                          {String(fits.length).padStart(2, "0")}
                        </p>
                        <h3 className="mt-2 max-w-sm font-display text-3xl leading-tight tracking-tight">
                          {fit.headline}
                        </h3>
                        {fits.length > 1 && (
                          <div className="mt-4 flex gap-1.5">
                            {fits.map((f, i) => (
                              <button
                                key={f.id}
                                type="button"
                                onClick={() => setFitIdx(i)}
                                className={clsx(
                                  "border px-3 py-1.5 font-mono text-[11px] transition-colors",
                                  i === fitIdx
                                    ? "border-ink bg-ink text-bone"
                                    : "border-line hover:border-ink/50",
                                )}
                              >
                                {String(i + 1).padStart(2, "0")}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <ScoreDial value={fit.score} size={124} stroke={7} label="harmony" />
                    </div>

                    {match && match.missing.length > 0 && (
                      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border border-dashed border-flame/60 bg-flame/5 px-4 py-3">
                        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink">
                          Missing:{" "}
                          <span className="text-flame">
                            {match.missing.map((c) => CATEGORY_LABEL[c]).join(" · ")}
                          </span>{" "}
                          — fits below are partial
                        </p>
                        <Link
                          href="/wardrobe?upload=1"
                          className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-flame underline underline-offset-4"
                        >
                          Add them <ArrowUpRight className="h-3 w-3" />
                        </Link>
                      </div>
                    )}

                    {/* slot rows with replace */}
                    <div className="mt-7">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft">
                          The fit — {wornItems.length} pieces
                        </p>
                        {overrideCount > 0 && (
                          <button
                            type="button"
                            onClick={() => setOverrides({})}
                            className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-flame hover:underline"
                          >
                            <RefreshCcw className="h-3 w-3" />
                            Reset {overrideCount} swap{overrideCount > 1 ? "s" : ""}
                          </button>
                        )}
                      </div>
                      <div className="space-y-2.5">
                        {fit.slots.map((slot) => (
                          <SlotRow
                            key={slot.slot}
                            slotLabel={CATEGORY_SINGLE[slot.slot]}
                            required={slot.required}
                            item={slot.item}
                            harmony={slot.harmony}
                            expanded={expandSlot === slot.slot}
                            candidates={candidateMap.get(slot.slot) ?? []}
                            placedId={slot.item?.id ?? null}
                            onToggle={() =>
                              setExpandSlot((cur) =>
                                cur === slot.slot ? null : slot.slot,
                              )
                            }
                            onSwap={(item) => swap(slot.slot, item)}
                          />
                        ))}
                      </div>
                    </div>

                    {/* breakdown */}
                    <div className="mt-9 space-y-3.5 border-t border-line pt-6">
                      <Bar label="Colour harmony" value={fit.breakdown.color} />
                      <Bar label="Style coherence" value={fit.breakdown.style} />
                      <Bar label="Value balance" value={fit.breakdown.balance} />
                    </div>

                    {/* notes */}
                    {fit.notes.length > 0 && (
                      <ul className="mt-7 space-y-2.5">
                        {fit.notes.map((note, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-3 text-sm leading-relaxed text-ink-soft"
                          >
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 bg-flame" />
                            {note}
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* save */}
                    <div className="mt-9 border-t border-line pt-6">
                      {naming ? (
                        <div className="flex flex-col gap-3 sm:flex-row">
                          <input
                            autoFocus
                            value={fitName}
                            onChange={(e) => setFitName(e.target.value)}
                            placeholder="Name it — “gallery friday”…"
                            onKeyDown={(e) => e.key === "Enter" && saveFit()}
                            className="flex-1 border border-line bg-paper px-4 py-3 text-sm outline-none placeholder:text-ink/35 focus:border-flame"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={saveFit}
                              disabled={savingFit}
                              className="inline-flex items-center gap-2 rounded-full bg-flame px-6 py-3 font-mono text-[11px] uppercase tracking-[0.16em] text-bone transition-colors hover:bg-ink disabled:opacity-60"
                            >
                              {savingFit ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Bookmark className="h-4 w-4" />
                              )}
                              Log it
                            </button>
                            <button
                              type="button"
                              onClick={() => setNaming(false)}
                              className="rounded-full border border-line px-5 py-3 font-mono text-[11px] uppercase tracking-[0.16em] hover:border-ink/50"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setNaming(true)}
                          className="inline-flex items-center gap-2.5 rounded-full border border-ink/25 px-6 py-3.5 font-mono text-[11px] uppercase tracking-[0.18em] transition-colors hover:border-flame hover:bg-flame hover:text-bone"
                        >
                          <Bookmark className="h-4 w-4" />
                          Log this fit to the lookbook
                        </button>
                      )}
                    </div>
                  </motion.div>
                </AnimatePresence>
              )}
            </div>
          </div>

          {/* lookbook */}
          <section className="mt-24 border-t border-line pt-10">
            <div className="mb-6 flex items-baseline justify-between">
              <h2 className="font-display text-3xl tracking-tight md:text-4xl">
                The <em className="italic">lookbook</em>
              </h2>
              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-soft">
                {saved.length} logged
              </span>
            </div>

            {saved.length === 0 ? (
              <div className="flex items-center gap-3 border border-dashed border-ink/25 px-5 py-6 text-sm text-ink-soft">
                <Sparkles className="h-4 w-4 shrink-0 text-flame" />
                Nothing logged yet. When a fit works, save it — future you
                will be grateful.
              </div>
            ) : (
              <div>
                <AnimatePresence initial={false}>
                  {saved.map((o) => {
                    const thumbs = o.itemIds
                      .map((id) => pieceById.get(id))
                      .filter((x): x is WardrobeItem => Boolean(x))
                      .slice(0, 5);
                    return (
                      <motion.div
                        key={o.id}
                        layout
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -24 }}
                        className="group flex flex-wrap items-center justify-between gap-4 border-b border-line py-4"
                      >
                        <div className="flex min-w-0 items-center gap-4">
                          <span className="w-9 text-right font-display text-xl italic text-flame">
                            {o.score}
                          </span>
                          {o.tryOnImageUrl ? (
                            <span className="h-14 w-11 shrink-0 overflow-hidden border border-line bg-bone-deep">
                              <img
                                src={o.tryOnImageUrl}
                                alt={o.name}
                                loading="lazy"
                                className="h-full w-full object-cover"
                              />
                            </span>
                          ) : null}
                          <div className="flex -space-x-3">
                            {thumbs.map((t) => (
                              <span
                                key={t.id}
                                className="h-11 w-11 overflow-hidden rounded-full border-2 border-bone bg-bone-deep"
                              >
                                <img
                                  src={t.imagePath}
                                  alt={t.name}
                                  loading="lazy"
                                  className="h-full w-full object-cover"
                                />
                              </span>
                            ))}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-display text-lg leading-tight tracking-tight">
                              {o.name}
                            </p>
                            <p className="truncate font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">
                              {o.headline}
                              {o.occasion ? ` — ${o.occasion}` : ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">
                            {new Date(o.createdAt).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                            })}
                          </span>
                          <button
                            type="button"
                            aria-label="Delete saved fit"
                            onClick={() => removeSaved(o.id)}
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-line text-ink-soft opacity-0 transition-all hover:border-flame hover:text-flame group-hover:opacity-100"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}

            <div className="mt-10">
              <Link
                href="/wardrobe"
                className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft transition-colors hover:text-flame"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to the wardrobe
              </Link>
            </div>
          </section>
        </>
      )}

      <Toast toast={toast} />
    </main>
  );
}

export default function MatchPage() {
  return (
    <Suspense fallback={null}>
      <MatchStudio />
    </Suspense>
  );
}
