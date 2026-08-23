"use client";

// ------------------------------------------------------------------
// The virtual try-on stage: the realistic generated photograph is the
// centrepiece of the outfit result. Handles every state cleanly —
// no model, provider unconfigured, idle, generating, done, failed.
// ------------------------------------------------------------------

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import {
  AlertTriangle,
  Camera,
  Info,
  RefreshCw,
  Sparkles,
  UserRound,
} from "lucide-react";
import {
  VtonSetupPanel,
  VtonStatusPill,
  type StatusPayload,
} from "@/components/vton-status";

export interface ProviderInfo {
  configured: boolean;
  activeProvider: string | null;
  activeLabel: string | null;
  activeIsLocal?: boolean;
  providers: Array<{
    id: string;
    label: string;
    configured: boolean;
    local?: boolean;
    supportsModelGeneration?: boolean;
    setup: string[];
  }>;
}

export interface TryOnResult {
  id: string;
  status: "pending" | "running" | "done" | "failed";
  view: string;
  itemIds: string[];
  imageUrl: string | null;
  provider: string | null;
  error: string | null;
  unsupported: string[];
}

export const VIEWS = [
  { id: "front", label: "Front", enabled: true },
  { id: "three-quarter", label: "3/4", enabled: false },
  { id: "side", label: "Side", enabled: false },
  { id: "back", label: "Back", enabled: false },
] as const;

const LOADING_LINES = [
  "Reading your garments…",
  "Fitting the pieces…",
  "Matching light and drape…",
  "Finishing the photograph…",
];

export function useTryOn(itemIds: string[], view = "front") {
  const [result, setResult] = useState<TryOnResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsModel, setNeedsModel] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollToken = useRef(0);
  const key = itemIds.join(",");

  const stopPolling = useCallback(() => {
    pollToken.current++; // invalidate any in-flight poll loop
    if (pollRef.current) clearTimeout(pollRef.current);
    pollRef.current = null;
  }, []);

  // look for an existing generation whenever the outfit changes —
  // cheap, and never triggers paid generation
  useEffect(() => {
    stopPolling();
    setResult(null);
    setError(null);
    setBusy(false);
    if (!key) return;
    let cancelled = false;
    fetch(`/api/try-on?itemIds=${encodeURIComponent(key)}&view=${view}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.result) setResult(d.result);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [key, view, stopPolling]);

  // loop-based polling (no self-recursion) with a cancellation flag
  const poll = useCallback(async (id: string) => {
    const token = ++pollToken.current;
    for (;;) {
      await new Promise<void>((r) => {
        pollRef.current = setTimeout(r, 2000);
      });
      if (token !== pollToken.current) return; // superseded/cancelled
      try {
        const res = await fetch(`/api/try-on/${id}`);
        const data = await res.json();
        if (token !== pollToken.current) return;
        if (data.result) {
          setResult(data.result);
          if (data.result.status === "done") {
            setBusy(false);
            return;
          }
          if (data.result.status === "failed") {
            setBusy(false);
            setError(data.result.error ?? "Generation failed.");
            return;
          }
        }
      } catch {
        setBusy(false);
        setError("Lost contact with the generator.");
        return;
      }
    }
  }, []);

  const generate = useCallback(
    async (force = false) => {
      if (!key) return;
      setBusy(true);
      setError(null);
      setNeedsModel(false);
      try {
        const res = await fetch("/api/try-on", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemIds, view, force }),
        });
        const data = await res.json();
        if (res.status === 409) {
          setNeedsModel(true);
          setError(data.error ?? "Create your model first.");
          setBusy(false);
          return;
        }
        if (!res.ok) {
          setError(data.error ?? "Could not start generation.");
          setBusy(false);
          return;
        }
        setResult(data.result);
        if (data.result.status === "done") {
          setBusy(false);
          return;
        }
        if (data.result.status === "failed") {
          setBusy(false);
          setError(data.result.error ?? "Generation failed.");
          return;
        }
        void poll(data.result.id);
      } catch {
        setBusy(false);
        setError("Could not reach the try-on service.");
      }
    },
    [itemIds, key, view, poll],
  );

  useEffect(() => () => stopPolling(), [stopPolling]);

  return { result, busy, error, needsModel, generate };
}

// ------------------------------------------------------------------

export function TryOnStage({
  provider,
  hasModel,
  modelImageUrl,
  result,
  busy,
  error,
  onGenerate,
  view,
  onViewChange,
  itemCount,
  vtonStatus,
  onRefreshStatus,
}: {
  provider: ProviderInfo | null;
  hasModel: boolean;
  modelImageUrl: string | null;
  result: TryOnResult | null;
  busy: boolean;
  error: string | null;
  onGenerate: (force?: boolean) => void;
  view: string;
  onViewChange: (v: string) => void;
  itemCount: number;
  vtonStatus?: StatusPayload | null;
  onRefreshStatus?: () => void;
}) {
  const [line, setLine] = useState(0);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setLine((i) => (i + 1) % LOADING_LINES.length), 2200);
    return () => clearInterval(t);
  }, [busy]);

  const isLocal = vtonStatus?.provider.activeIsLocal ?? false;
  // Local provider: "configured" is not enough — the service must be up.
  const canGenerate = isLocal
    ? Boolean(vtonStatus?.local?.ready)
    : (provider?.configured ?? false);
  const configured = provider?.configured ?? false;
  const image = result?.status === "done" ? result.imageUrl : null;

  return (
    <div>
      {vtonStatus && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <VtonStatusPill status={vtonStatus} onRefresh={onRefreshStatus} />
          {isLocal && vtonStatus.local?.ready && (
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink/40">
              on-device · nothing uploaded
            </span>
          )}
        </div>
      )}

      {/* the stage */}
      <div className="relative overflow-hidden border border-line bg-paper shadow-[12px_12px_0_0_#17140e]">
        <div className="relative aspect-[3/4] w-full bg-bone-deep">
          {/* generated photograph */}
          <AnimatePresence mode="wait">
            {image ? (
              <motion.img
                key={image}
                src={image}
                alt="Your outfit, worn"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
                className="h-full w-full object-cover"
              />
            ) : modelImageUrl ? (
              <motion.img
                key="ref"
                src={modelImageUrl}
                alt="Your model"
                initial={{ opacity: 0 }}
                animate={{ opacity: busy ? 0.32 : 0.5 }}
                className="h-full w-full object-cover grayscale"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <UserRound className="h-16 w-16 text-ink/15" strokeWidth={1.2} />
              </div>
            )}
          </AnimatePresence>

          {/* generating overlay */}
          <AnimatePresence>
            {busy && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-bone/80 backdrop-blur-[2px]"
              >
                <span className="relative flex h-12 w-12">
                  <span className="absolute inset-0 animate-ping rounded-full bg-flame/25" />
                  <span className="relative m-auto h-3 w-3 rounded-full bg-flame" />
                </span>
                <p className="font-display text-2xl italic tracking-tight">
                  Creating your outfit…
                </p>
                <AnimatePresence mode="wait">
                  <motion.p
                    key={line}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft"
                  >
                    {LOADING_LINES[line]}
                  </motion.p>
                </AnimatePresence>
                <p className="max-w-[220px] text-center font-mono text-[10px] text-ink/40">
                  This can take up to a minute. You can keep browsing.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* idle CTA */}
          {!busy && !image && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-bone/55 p-6 text-center backdrop-blur-[1px]">
              <Camera className="h-8 w-8 text-ink-soft" strokeWidth={1.4} />
              <p className="max-w-[240px] font-display text-2xl leading-tight tracking-tight">
                {hasModel
                  ? "See this on your model"
                  : "Set up your model to see this worn"}
              </p>
              {hasModel ? (
                <button
                  type="button"
                  disabled={!canGenerate || itemCount === 0}
                  onClick={() => onGenerate(false)}
                  className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 font-mono text-[11px] uppercase tracking-[0.18em] text-bone transition-colors hover:bg-flame disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Sparkles className="h-4 w-4" />
                  Generate try-on
                </button>
              ) : (
                <Link
                  href="/model"
                  className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 font-mono text-[11px] uppercase tracking-[0.18em] text-bone transition-colors hover:bg-flame"
                >
                  <UserRound className="h-4 w-4" />
                  Set up my model
                </Link>
              )}
            </div>
          )}

          {result?.status === "done" && (
            <span className="absolute left-3 top-3 bg-ink/85 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.18em] text-bone">
              AI try-on · {result.provider}
            </span>
          )}
        </div>

        {/* views + regenerate */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-3 py-2.5">
          <div className="flex gap-1">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                disabled={!v.enabled}
                title={v.enabled ? v.label : "Coming soon"}
                onClick={() => v.enabled && onViewChange(v.id)}
                className={clsx(
                  "px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors",
                  view === v.id
                    ? "bg-ink text-bone"
                    : v.enabled
                      ? "text-ink-soft hover:text-ink"
                      : "cursor-not-allowed text-ink/25",
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={busy || !hasModel || !canGenerate || itemCount === 0}
            onClick={() => onGenerate(true)}
            className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft transition-colors hover:text-flame disabled:opacity-30"
          >
            <RefreshCw className={clsx("h-3.5 w-3.5", busy && "animate-spin")} />
            Try again
          </button>
        </div>
      </div>

      {/* local service setup (only when the local provider is active) */}
      {vtonStatus?.provider.activeIsLocal && !vtonStatus.local?.ready && (
        <div className="mt-4">
          <VtonSetupPanel status={vtonStatus} />
        </div>
      )}

      {/* no provider at all */}
      {provider && !configured && !vtonStatus?.provider.activeIsLocal && (
        <div className="mt-4 border border-dashed border-ink/30 bg-paper px-4 py-4">
          <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink">
            <Info className="h-3.5 w-3.5 text-flame" />
            No try-on provider available
          </p>
          <ul className="mt-3 space-y-2.5">
            {provider.providers.map((p) => (
              <li key={p.id}>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink">
                  {p.label}
                </p>
                <ul className="mt-1 space-y-0.5">
                  {p.setup.map((sx) => (
                    <li
                      key={sx}
                      className="font-mono text-[10px] leading-relaxed text-ink/50"
                    >
                      · {sx}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* errors */}
      {error && canGenerate && (
        <div className="mt-4 flex items-start gap-2.5 border border-flame/50 bg-flame/5 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-flame" />
          <div>
            <p className="text-xs leading-relaxed text-ink">{error}</p>
            <button
              type="button"
              onClick={() => onGenerate(true)}
              className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-flame underline underline-offset-4"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {/* garments the provider could not physically apply */}
      {result?.status === "done" && result.unsupported.length > 0 && (
        <p className="mt-3 font-mono text-[10px] leading-relaxed text-ink/45">
          Note: {result.unsupported.length} piece
          {result.unsupported.length > 1 ? "s" : ""} could not be rendered by
          this provider and {result.unsupported.length > 1 ? "are" : "is"} shown
          in the item list only.
        </p>
      )}
    </div>
  );
}
