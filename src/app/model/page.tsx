"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  CloudUpload,
  Info,
  Loader2,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
} from "lucide-react";
import { CharacterControls } from "@/components/character-form";
import { Toast } from "@/components/toast";
import type { ProviderInfo } from "@/components/tryon-panel";
import { DEFAULT_CHARACTER, type CharacterParams } from "@/avatar/params";

interface UserModel {
  id: string;
  type: "upload" | "virtual";
  status: string;
  imageUrl: string | null;
  params: CharacterParams | null;
  provider: string | null;
  error: string | null;
  updatedAt: string;
}

type Mode = "upload" | "virtual";

export default function ModelPage() {
  const [model, setModel] = useState<UserModel | null>(null);
  const [provider, setProvider] = useState<ProviderInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<Mode>("upload");
  const [params, setParams] = useState<CharacterParams>(DEFAULT_CHARACTER);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const showToast = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2800);
  }, []);

  const load = useCallback(async () => {
    try {
      const [modelRes, charRes] = await Promise.all([
        fetch("/api/model").then((r) => r.json()),
        fetch("/api/character").then((r) => r.json()),
      ]);
      setModel(modelRes.model);
      setProvider(modelRes.provider);
      if (modelRes.model?.type) setMode(modelRes.model.type);
      // seed the virtual-model form from the saved character profile
      setParams(modelRes.model?.params ?? charRes.character ?? DEFAULT_CHARACTER);
    } catch {
      /* keep defaults */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function pickFile(f: File | null | undefined) {
    if (!f) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) {
      setError("Use a JPG, PNG or WEBP photo.");
      return;
    }
    if (f.size > 12 * 1024 * 1024) {
      setError("Keep the photo under 12 MB.");
      return;
    }
    setError(null);
    setFile(f);
  }

  async function saveUpload() {
    if (!file) {
      setError("Choose a full-body photo first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const res = await fetch("/api/model", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed.");
      setModel(data.model);
      setFile(null);
      showToast("Reference photo saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function generateVirtual() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ params }),
      });
      const data = await res.json();
      if (data.provider) setProvider(data.provider);
      if (!res.ok) {
        setModel(data.model ?? null);
        throw new Error(data.error || "Could not generate the model.");
      }
      setModel(data.model);
      showToast("Virtual model created");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate the model.");
    } finally {
      setBusy(false);
    }
  }

  async function removeModel() {
    setBusy(true);
    try {
      await fetch("/api/model", { method: "DELETE" });
      setModel(null);
      showToast("Model removed");
    } finally {
      setBusy(false);
    }
  }

  const configured = provider?.configured ?? false;
  // Generating a realistic reference PERSON is a different model class
  // than try-on. The local CatVTON provider cannot do it.
  const canGenerateModel = Boolean(
    provider?.providers.find((p) => p.id === provider.activeProvider)
      ?.supportsModelGeneration,
  );
  const ready = model?.status === "ready" && model.imageUrl;

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-14 sm:px-6">
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-line pb-8 pt-10">
        <div>
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.26em] text-flame">
            {ready ? `Model ready — ${model?.type}` : "No model yet"}
          </p>
          <h1 className="font-display text-5xl tracking-tight md:text-7xl">
            My <em className="italic">model</em>
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-soft">
            The reference person your outfits are photographed on. Upload
            yourself, or generate a realistic stand-in.
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

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_380px] lg:gap-14">
        {/* ---------------------------------------------- controls */}
        <div className="order-2 lg:order-1">
          {/* mode switch */}
          <div className="mb-8 flex gap-2">
            {(
              [
                { id: "upload", label: "Upload myself" },
                { id: "virtual", label: "Create a model" },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={clsx(
                  "flex-1 rounded-full border px-5 py-3 font-mono text-[11px] uppercase tracking-[0.16em] transition-colors",
                  mode === m.id
                    ? "border-ink bg-ink text-bone"
                    : "border-line bg-paper hover:border-ink/50",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {mode === "upload" ? (
              <motion.div
                key="upload"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
              >
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
                    "flex cursor-pointer flex-col items-center justify-center gap-2 border border-dashed px-4 py-10 text-center transition-colors",
                    dragOver
                      ? "border-flame bg-flame/5"
                      : "border-ink/30 bg-paper hover:border-ink/60",
                  )}
                >
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => pickFile(e.target.files?.[0])}
                  />
                  {preview ? (
                    <div className="flex items-center gap-4">
                      <img
                        src={preview}
                        alt="Preview"
                        className="h-28 w-20 border border-line object-cover"
                      />
                      <div className="text-left">
                        <p className="text-sm font-medium">{file?.name}</p>
                        <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">
                          Click to choose another
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <CloudUpload className="h-7 w-7 text-ink-soft" strokeWidth={1.6} />
                      <p className="text-sm">
                        Drop a full-body photo, or{" "}
                        <span className="underline underline-offset-4">browse</span>
                      </p>
                      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">
                        JPG · PNG · WEBP — under 12 MB
                      </p>
                    </>
                  )}
                </div>

                <div className="mt-5 border border-line bg-paper px-4 py-4">
                  <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink">
                    <Info className="h-3.5 w-3.5 text-flame" />
                    What works best
                  </p>
                  <ul className="mt-2.5 space-y-1.5 text-xs leading-relaxed text-ink-soft">
                    <li>· Full body in frame, head to feet</li>
                    <li>· Facing the camera, standing straight</li>
                    <li>· Fitted clothing so your shape is visible</li>
                    <li>· Plain background, even lighting, no heavy shadows</li>
                    <li>· One person only, no crops or sunglasses</li>
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={saveUpload}
                  disabled={busy || !file}
                  className="mt-6 inline-flex w-full items-center justify-center gap-2.5 rounded-full bg-flame px-6 py-3.5 font-mono text-[11px] uppercase tracking-[0.18em] text-bone transition-colors hover:bg-ink disabled:opacity-40"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CloudUpload className="h-4 w-4" />
                  )}
                  Save as my model
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="virtual"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
              >
                {loaded ? (
                  <CharacterControls value={params} onChange={setParams} />
                ) : (
                  <div className="space-y-8">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="animate-soft-pulse">
                        <div className="h-3 w-24 bg-bone-deep" />
                        <div className="mt-3 h-8 w-2/3 rounded-full bg-bone-deep" />
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={generateVirtual}
                  disabled={busy || !canGenerateModel}
                  className="mt-9 inline-flex w-full items-center justify-center gap-2.5 rounded-full bg-flame px-6 py-3.5 font-mono text-[11px] uppercase tracking-[0.18em] text-bone transition-colors hover:bg-ink disabled:opacity-40"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {busy ? "Creating your model…" : "Generate realistic model"}
                </button>
                <p className="mt-3 text-center font-mono text-[10px] leading-relaxed text-ink/45">
                  Generated once and reused for every outfit, so your model
                  keeps the same face.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {error && (
            <div className="mt-6 flex items-start gap-2.5 border border-flame/50 bg-flame/5 px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-flame" />
              <p className="text-xs leading-relaxed text-ink">{error}</p>
            </div>
          )}

          {/* provider status */}
          {provider && !canGenerateModel && mode === "virtual" && (
            <div className="mt-6 border border-dashed border-ink/30 bg-paper px-4 py-4">
              <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink">
                <Info className="h-3.5 w-3.5 text-flame" />
                Not available with the local provider
              </p>
              <p className="mt-2 text-xs leading-relaxed text-ink-soft">
                Local CatVTON performs <em>try-on only</em> — it fits garments
                onto a real photograph and cannot invent a person. Upload a
                full-body photo instead (works fully offline), or configure a
                cloud image provider below.
              </p>
              <ul className="mt-3 space-y-2.5">
                {provider.providers.map((p) => (
                  <li key={p.id}>
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink">
                      {p.label}
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {p.setup.map((s) => (
                        <li key={s} className="font-mono text-[10px] text-ink/50">
                          · {s}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-8 flex items-start gap-2 font-mono text-[10px] leading-relaxed text-ink/45">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Your photo is stored privately outside the public web root and is
            only served to you through an authenticated media route.
          </p>
        </div>

        {/* ---------------------------------------------- preview */}
        <div className="order-1 lg:order-2">
          <div className="lg:sticky lg:top-20">
            <div className="border border-line bg-paper p-4 shadow-[12px_12px_0_0_#17140e]">
              <div className="relative aspect-[3/4] w-full overflow-hidden bg-bone-deep">
                {ready ? (
                  <img
                    src={model!.imageUrl!}
                    alt="Your model"
                    className="h-full w-full object-cover"
                  />
                ) : preview && mode === "upload" ? (
                  <img
                    src={preview}
                    alt="Preview"
                    className="h-full w-full object-cover opacity-70"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
                    <UserRound className="h-14 w-14 text-ink/15" strokeWidth={1.2} />
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink/40">
                      No reference yet
                    </p>
                  </div>
                )}
                {busy && (
                  <div className="absolute inset-0 flex items-center justify-center bg-bone/70 backdrop-blur-[2px]">
                    <Loader2 className="h-7 w-7 animate-spin text-flame" />
                  </div>
                )}
              </div>
              <div className="mt-3 flex items-center justify-between px-1">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                  {ready
                    ? model!.type === "upload"
                      ? "Your photo"
                      : "Generated model"
                    : "Reference person"}
                </span>
                {ready && (
                  <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.16em] text-flame">
                    <Check className="h-3 w-3" /> Ready
                  </span>
                )}
              </div>
            </div>

            {model && (
              <button
                type="button"
                onClick={removeModel}
                disabled={busy}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border border-line px-5 py-3 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft transition-colors hover:border-flame hover:text-flame disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove model
              </button>
            )}

            {provider?.configured && (
              <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-ink/40">
                Provider: {provider.activeLabel}
              </p>
            )}
          </div>
        </div>
      </div>

      <Toast toast={toast} />
    </main>
  );
}
