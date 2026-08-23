"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import {
  Check,
  CloudUpload,
  Heart,
  Loader2,
  Pencil,
  Search,
  Shirt,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  STYLE_TAGS,
  type Category,
  type WardrobeItem,
} from "@/lib/types";

// -----------------------------------------------------------------------

function Toast({ toast }: { toast: string | null }) {
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12 }}
          className="fixed bottom-6 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-2.5 border border-line bg-ink px-5 py-3 text-bone shadow-[8px_8px_0_0_rgba(23,20,14,0.25)]"
        >
          <Check className="h-4 w-4 text-flame" strokeWidth={2.5} />
          <span className="font-mono text-[11px] uppercase tracking-[0.16em]">
            {toast}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// -----------------------------------------------------------------------

type ModalState = { mode: "create" } | { mode: "edit"; item: WardrobeItem } | null;

const UPLOAD_LINES = [
  "Stitching the upload…",
  "Reading pixels…",
  "Naming the colour…",
];

function ItemModal({
  state,
  onClose,
  onSaved,
}: {
  state: Exclude<ModalState, null>;
  onClose: () => void;
  onSaved: (item: WardrobeItem, created: boolean) => void;
}) {
  const editing = state.mode === "edit" ? state.item : null;
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState(editing?.name ?? "");
  const [brand, setBrand] = useState(editing?.brand ?? "");
  const [category, setCategory] = useState<Category>(editing?.category ?? "tops");
  const [tags, setTags] = useState<string[]>(editing?.tags ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [lineIdx, setLineIdx] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  const preview = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(
      () => setLineIdx((i) => (i + 1) % UPLOAD_LINES.length),
      1100,
    );
    return () => clearInterval(t);
  }, [busy]);

  function pickFile(f: File | undefined | null) {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("That file is not an image — try a photo of the piece.");
      return;
    }
    if (f.size > 8 * 1024 * 1024) {
      setError("Keep it under 8 MB.");
      return;
    }
    setError(null);
    setFile(f);
    if (!name.trim()) {
      setName(f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
    }
  }

  async function submit() {
    if (!editing && !file) {
      setError("A photo of the piece is required.");
      return;
    }
    if (!name.trim()) {
      setError("Give the piece a name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let res: Response;
      if (editing) {
        res = await fetch(`/api/items/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), brand: brand.trim() || null, category, tags }),
        });
      } else {
        const fd = new FormData();
        fd.append("image", file as File);
        fd.append("name", name.trim());
        fd.append("category", category);
        if (brand.trim()) fd.append("brand", brand.trim());
        tags.forEach((t) => fd.append("tags", t));
        res = await fetch("/api/items", { method: "POST", body: fd });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      onSaved(data.item, !editing);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto border border-line bg-bone p-6 shadow-[12px_12px_0_0_#17140e] sm:p-8"
      >
        <div className="mb-6 flex items-start justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-flame">
              {editing ? "Edit piece" : "New piece"}
            </p>
            <h3 className="mt-1 font-display text-3xl tracking-tight">
              {editing ? "Adjust the details." : "Hang it in the closet."}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line transition-colors hover:bg-bone-deep"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!editing && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              pickFile(e.dataTransfer.files?.[0]);
            }}
            onClick={() => fileInput.current?.click()}
            className={clsx(
              "relative mb-5 flex cursor-pointer flex-col items-center justify-center gap-2 border border-dashed px-4 py-8 text-center transition-colors",
              dragOver
                ? "border-flame bg-flame/5"
                : "border-ink/30 bg-paper hover:border-ink/60",
              preview && "py-3",
            )}
          >
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
            {preview ? (
              <div className="flex items-center gap-4">
                <img
                  src={preview}
                  alt="Preview"
                  className="h-20 w-20 border border-line object-cover"
                />
                <div className="text-left">
                  <p className="text-sm font-medium">{file?.name}</p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">
                    Click to swap the photo
                  </p>
                </div>
              </div>
            ) : (
              <>
                <CloudUpload className="h-7 w-7 text-ink-soft" strokeWidth={1.6} />
                <p className="text-sm">
                  Drop a photo, or{" "}
                  <span className="underline underline-offset-4">browse</span>
                </p>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">
                  JPG · PNG · WEBP — under 8 MB
                </p>
              </>
            )}
          </div>
        )}

        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
            <label className="block">
              <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft">
                Name
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Rust cable knit"
                className="w-full border border-line bg-paper px-3.5 py-2.5 text-sm outline-none placeholder:text-ink/35 focus:border-flame"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft">
                Brand
              </span>
              <input
                value={brand ?? ""}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Optional"
                className="w-full border border-line bg-paper px-3.5 py-2.5 text-sm outline-none placeholder:text-ink/35 focus:border-flame"
              />
            </label>
          </div>

          <div>
            <span className="mb-2 block font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft">
              Category
            </span>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={clsx(
                    "rounded-full border px-4 py-1.5 text-xs transition-colors",
                    category === c
                      ? "border-ink bg-ink text-bone"
                      : "border-line bg-paper hover:border-ink/50",
                  )}
                >
                  {CATEGORY_LABEL[c]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-2 block font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft">
              Style codes{" "}
              <span className="text-ink/40">— these steer the engine</span>
            </span>
            <div className="flex flex-wrap gap-2">
              {STYLE_TAGS.map((t) => {
                const on = tags.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() =>
                      setTags((cur) =>
                        on ? cur.filter((x) => x !== t) : [...cur, t],
                      )
                    }
                    className={clsx(
                      "rounded-full border px-3.5 py-1 font-mono text-[11px] transition-colors",
                      on
                        ? "border-flame bg-flame text-bone"
                        : "border-line bg-paper text-ink-soft hover:border-ink/50 hover:text-ink",
                    )}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <p className="border border-flame/50 bg-flame/5 px-3.5 py-2.5 text-xs text-flame">
              {error}
            </p>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={submit}
            className="flex w-full items-center justify-center gap-2.5 rounded-full bg-ink px-6 py-3.5 font-mono text-[11px] uppercase tracking-[0.2em] text-bone transition-colors hover:bg-flame disabled:opacity-60"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="animate-soft-pulse">
                  {editing ? "Saving…" : UPLOAD_LINES[lineIdx]}
                </span>
              </>
            ) : (
              <>
                {editing ? "Save changes" : "Read pixels & add piece"}
                {!editing && <Sparkles className="h-4 w-4" />}
              </>
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// -----------------------------------------------------------------------

function ItemCard({
  item,
  index,
  onEdit,
  onDeleted,
  onToggleFav,
}: {
  item: WardrobeItem;
  index: number;
  onEdit: () => void;
  onDeleted: () => void;
  onToggleFav: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 3200);
    return () => clearTimeout(t);
  }, [confirming]);

  async function remove() {
    setBusy(true);
    try {
      await fetch(`/api/items/${item.id}`, { method: "DELETE" });
      onDeleted();
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.04, 0.3) }}
      className="group border border-line bg-paper transition-shadow hover:shadow-[7px_7px_0_0_#17140e]"
    >
      <div className="relative aspect-square overflow-hidden bg-bone-deep">
        <img
          src={item.imagePath}
          alt={item.name}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]"
        />
        <span className="absolute left-2.5 top-2.5 bg-bone/90 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.18em] text-ink">
          Nº {String(index + 1).padStart(3, "0")}
        </span>
        <button
          type="button"
          aria-label="Favorite"
          onClick={onToggleFav}
          className={clsx(
            "absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full border transition-colors",
            item.favorite
              ? "border-flame bg-flame text-bone"
              : "border-line bg-bone/90 text-ink-soft hover:text-flame",
          )}
        >
          <Heart
            className="h-3.5 w-3.5"
            fill={item.favorite ? "currentColor" : "none"}
          />
        </button>

        {/* hover actions */}
        <div className="absolute inset-x-0 bottom-0 flex translate-y-full bg-ink/95 text-bone transition-transform duration-300 group-hover:translate-y-0">
          <Link
            href={`/match?anchor=${item.id}`}
            className="flex-1 py-2.5 text-center font-mono text-[10px] uppercase tracking-[0.18em] transition-colors hover:bg-flame"
          >
            Match this
          </Link>
          <button
            type="button"
            onClick={onEdit}
            aria-label="Edit"
            className="flex w-11 items-center justify-center border-l border-bone/15 transition-colors hover:bg-bone/10"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label="Delete"
            className="flex w-11 items-center justify-center border-l border-bone/15 transition-colors hover:bg-flame"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* delete confirm */}
        <AnimatePresence>
          {confirming && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-ink/85 p-4 text-center text-bone"
            >
              <p className="font-display text-lg italic">Retire this piece?</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={remove}
                  disabled={busy}
                  className="rounded-full bg-flame px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em]"
                >
                  {busy ? "…" : "Retire it"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="rounded-full border border-bone/40 px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em]"
                >
                  Keep
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="p-3.5">
        <h3 className="truncate font-display text-lg leading-tight tracking-tight">
          {item.name}
        </h3>
        <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
          {CATEGORY_LABEL[item.category]}
          {item.brand ? ` — ${item.brand}` : ""}
        </p>
        <div className="mt-2.5 flex items-center justify-between">
          <div className="flex gap-1">
            {item.palette.slice(0, 4).map((hex) => (
              <span
                key={hex}
                title={hex}
                className="h-3.5 w-3.5 rounded-full border border-line"
                style={{ background: hex }}
              />
            ))}
          </div>
          <span className="font-mono text-[10px] text-ink-soft">
            {item.colorName}
          </span>
        </div>
        {item.tags.length > 0 && (
          <p className="mt-2 truncate font-mono text-[10px] text-ink/50">
            {item.tags.join(" · ")}
          </p>
        )}
      </div>
    </motion.article>
  );
}

// -----------------------------------------------------------------------

function Wardrobe() {
  const searchParams = useSearchParams();
  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<Category | "all">("all");
  const [q, setQ] = useState("");
  const [modal, setModal] = useState<ModalState>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/items");
      const data = await res.json();
      setItems(data.items ?? []);
    } catch {
      /* keep stale */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (searchParams.get("upload")) setModal({ mode: "create" });
  }, [searchParams]);

  const counts = useMemo(() => {
    const map = new Map<Category, number>();
    for (const i of items) map.set(i.category, (map.get(i.category) ?? 0) + 1);
    return map;
  }, [items]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter(
      (i) =>
        (category === "all" || i.category === category) &&
        (!needle ||
          i.name.toLowerCase().includes(needle) ||
          (i.brand ?? "").toLowerCase().includes(needle)),
    );
  }, [items, category, q]);

  function onSaved(item: WardrobeItem, created: boolean) {
    setItems((cur) =>
      created ? [item, ...cur] : cur.map((i) => (i.id === item.id ? item : i)),
    );
    showToast(
      created ? `Added — palette reads “${item.colorName}”` : "Piece updated",
    );
  }

  async function toggleFav(item: WardrobeItem) {
    setItems((cur) =>
      cur.map((i) => (i.id === item.id ? { ...i, favorite: !i.favorite } : i)),
    );
    try {
      await fetch(`/api/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorite: !item.favorite }),
      });
    } catch {
      load();
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-14 sm:px-6">
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-line pb-8 pt-10">
        <div>
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.26em] text-flame">
            {items.length} pieces indexed
          </p>
          <h1 className="font-display text-5xl tracking-tight md:text-7xl">
            The <em className="italic">wardrobe</em>
          </h1>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-ink-soft">
            Every thread you own, indexed by colour and style code — ready to
            be paired.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModal({ mode: "create" })}
          className="inline-flex items-center gap-2.5 rounded-full bg-flame px-6 py-3.5 font-mono text-[11px] uppercase tracking-[0.18em] text-bone transition-colors hover:bg-ink"
        >
          <CloudUpload className="h-4 w-4" />
          Add a piece
        </button>
      </div>

      {/* filters */}
      <div className="mt-7 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCategory("all")}
            className={clsx(
              "rounded-full border px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors",
              category === "all"
                ? "border-ink bg-ink text-bone"
                : "border-line hover:border-ink/50",
            )}
          >
            All · {items.length}
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={clsx(
                "rounded-full border px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors",
                category === c
                  ? "border-ink bg-ink text-bone"
                  : "border-line hover:border-ink/50",
              )}
            >
              {CATEGORY_LABEL[c]} · {counts.get(c) ?? 0}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search pieces…"
            className="w-full rounded-full border border-line bg-paper py-2.5 pl-10 pr-4 text-sm outline-none placeholder:text-ink/35 focus:border-flame"
          />
        </div>
      </div>

      {/* grid */}
      {loading ? (
        <div className="mt-9 grid grid-cols-2 gap-5 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="animate-soft-pulse">
              <div className="aspect-square border border-line bg-bone-deep" />
              <div className="mt-3 h-4 w-2/3 bg-bone-deep" />
              <div className="mt-2 h-3 w-1/3 bg-bone-deep" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-12 flex flex-col items-center border border-dashed border-ink/30 px-6 py-20 text-center"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full border border-line">
            <Shirt className="h-6 w-6 text-ink-soft" strokeWidth={1.6} />
          </span>
          <h2 className="mt-6 font-display text-3xl italic tracking-tight">
            {items.length === 0
              ? "The rails are empty."
              : "Nothing matches that filter."}
          </h2>
          <p className="mt-2 max-w-xs text-sm text-ink-soft">
            {items.length === 0
              ? "Hang your first piece and the engine will start learning your palette."
              : "Loosen the search or pick another category."}
          </p>
          {items.length === 0 && (
            <button
              type="button"
              onClick={() => setModal({ mode: "create" })}
              className="mt-7 inline-flex items-center gap-2.5 rounded-full bg-ink px-7 py-3.5 font-mono text-[11px] uppercase tracking-[0.18em] text-bone transition-colors hover:bg-flame"
            >
              <CloudUpload className="h-4 w-4" />
              Upload your first piece
            </button>
          )}
        </motion.div>
      ) : (
        <div className="mt-9 grid grid-cols-2 gap-5 md:grid-cols-3 lg:grid-cols-4">
          <AnimatePresence mode="popLayout">
            {filtered.map((item, i) => (
              <ItemCard
                key={item.id}
                item={item}
                index={i}
                onEdit={() => setModal({ mode: "edit", item })}
                onDeleted={() => {
                  setItems((cur) => cur.filter((x) => x.id !== item.id));
                  showToast("Piece retired");
                }}
                onToggleFav={() => toggleFav(item)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {modal && (
          <ItemModal
            state={modal}
            onClose={() => setModal(null)}
            onSaved={onSaved}
          />
        )}
      </AnimatePresence>
      <Toast toast={toast} />
    </main>
  );
}

export default function WardrobePage() {
  return (
    <Suspense fallback={null}>
      <Wardrobe />
    </Suspense>
  );
}
