"use client";

// ------------------------------------------------------------------
// Status of the LOCAL virtual try-on service (vton-service/server.py).
// Polls /api/try-on/status, which only pings 127.0.0.1/health.
// ------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { RefreshCw, Terminal } from "lucide-react";

export interface LocalHealth {
  reachable: boolean;
  status: "ready" | "unavailable" | "unreachable";
  ready: boolean;
  serviceUrl: string;
  model?: {
    name: string;
    version: string;
    available: boolean;
    loaded: boolean;
    loading: boolean;
    automasker: boolean;
    base_model: string;
    resolution: string;
    load_error: string | null;
  };
  backend?: {
    python: string;
    pillow: boolean;
    torch_installed: boolean;
    torch_version: string | null;
    cuda_available: boolean;
    hip_version: string | null;
    devices: Array<{ name: string; total_memory_gb: number; arch: string }>;
    device: string | null;
    device_reason: string;
    allow_cpu: boolean;
  };
  capabilities?: {
    max_garments_per_request: number;
    auto_mask: boolean;
  };
  reasons: string[];
  license?: string;
}

export interface StatusPayload {
  provider: {
    configured: boolean;
    activeProvider: string | null;
    activeLabel: string | null;
    activeIsLocal: boolean;
    providers: Array<{
      id: string;
      label: string;
      configured: boolean;
      local: boolean;
      setup: string[];
    }>;
  };
  local: LocalHealth | null;
}

export function useVtonStatus(pollMs = 0) {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/try-on/status");
      setStatus(await res.json());
    } catch {
      /* keep last known */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    if (!pollMs) return;
    const t = setInterval(refresh, pollMs);
    return () => clearInterval(t);
  }, [refresh, pollMs]);

  return { status, loading, refresh };
}

// ------------------------------------------------------------------

export function VtonStatusPill({
  status,
  onRefresh,
  className,
}: {
  status: StatusPayload | null;
  onRefresh?: () => void;
  className?: string;
}) {
  const [spinning, setSpinning] = useState(false);
  const local = status?.local;
  const isLocal = status?.provider.activeIsLocal ?? true;

  let tone: "ready" | "warn" | "off" = "off";
  let label = "Virtual Try-On Not Running";

  if (!isLocal && status?.provider.configured) {
    tone = "ready";
    label = `Try-On via ${status.provider.activeLabel}`;
  } else if (local?.ready) {
    tone = "ready";
    label = local.model?.loaded
      ? "Virtual Try-On Ready"
      : "Virtual Try-On Ready (model loads on first use)";
  } else if (local?.reachable) {
    tone = "warn";
    label = "Virtual Try-On Not Installed";
  } else {
    tone = "off";
    label = "Virtual Try-On Not Running";
  }

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-2 border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em]",
        tone === "ready" && "border-line bg-paper text-ink",
        tone === "warn" && "border-flame/50 bg-flame/5 text-ink",
        tone === "off" && "border-line bg-paper text-ink-soft",
        className,
      )}
    >
      <span
        className={clsx(
          "h-2 w-2 rounded-full",
          tone === "ready" && "bg-emerald-600",
          tone === "warn" && "bg-flame",
          tone === "off" && "border border-ink/30 bg-transparent",
        )}
      />
      {label}
      {onRefresh && (
        <button
          type="button"
          aria-label="Refresh try-on service status"
          onClick={async () => {
            setSpinning(true);
            await onRefresh();
            setTimeout(() => setSpinning(false), 400);
          }}
          className="ml-0.5 text-ink-soft transition-colors hover:text-flame"
        >
          <RefreshCw className={clsx("h-3 w-3", spinning && "animate-spin")} />
        </button>
      )}
    </span>
  );
}

// ------------------------------------------------------------------

const START_CMD = "python vton-service/server.py";

export function VtonSetupPanel({ status }: { status: StatusPayload | null }) {
  const local = status?.local;
  if (!status || !status.provider.activeIsLocal) return null;
  if (local?.ready) return null;

  const notRunning = !local?.reachable;
  const backend = local?.backend;

  return (
    <div className="border border-dashed border-ink/30 bg-paper px-4 py-4">
      <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink">
        <Terminal className="h-3.5 w-3.5 text-flame" />
        {notRunning
          ? "Local virtual try-on is not running"
          : "Local virtual try-on is not installed"}
      </p>

      <p className="mt-2 text-xs leading-relaxed text-ink-soft">
        {notRunning ? (
          <>
            Start the local service, then refresh. Nothing is sent to the
            cloud — generation happens entirely on your machine.
          </>
        ) : (
          <>
            The service is running at{" "}
            <span className="font-mono">{local?.serviceUrl}</span>, but the
            CatVTON model stack is not ready yet:
          </>
        )}
      </p>

      {notRunning ? (
        <pre className="mt-3 overflow-x-auto border border-line bg-bone px-3 py-2 font-mono text-[11px] text-ink">
          {START_CMD}
        </pre>
      ) : (
        <ul className="mt-3 space-y-1">
          {(local?.reasons ?? []).map((r) => (
            <li key={r} className="font-mono text-[10px] leading-relaxed text-flame">
              · {r}
            </li>
          ))}
        </ul>
      )}

      {backend && (
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-line pt-3 font-mono text-[10px] text-ink-soft">
          <dt>Python</dt>
          <dd className="text-ink">{backend.python}</dd>
          <dt>PyTorch</dt>
          <dd className="text-ink">
            {backend.torch_installed ? backend.torch_version : "not installed"}
          </dd>
          <dt>GPU backend</dt>
          <dd className="text-ink">
            {backend.cuda_available
              ? `${backend.hip_version ? "ROCm" : "CUDA"} · ${backend.devices[0]?.name ?? "GPU"}`
              : "none detected"}
          </dd>
          <dt>Device</dt>
          <dd className="text-ink">{backend.device ?? "unavailable"}</dd>
          {local?.capabilities && (
            <>
              <dt>Auto-mask</dt>
              <dd className="text-ink">
                {local.capabilities.auto_mask ? "available" : "not installed"}
              </dd>
            </>
          )}
        </dl>
      )}

      <p className="mt-3 font-mono text-[10px] leading-relaxed text-ink/45">
        Full setup instructions live in the README under “Local Virtual
        Try-On”. CatVTON is licensed CC BY-NC-SA 4.0 — non-commercial use only.
      </p>
    </div>
  );
}
