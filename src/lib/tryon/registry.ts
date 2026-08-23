// ------------------------------------------------------------------
// Provider registry. Swapping backends is a single env var:
//   TRYON_PROVIDER=catvton | fal | gemini
//
// Order matters: the LOCAL provider comes first, so a machine with the
// local service running never silently reaches for a paid cloud API.
// No provider is ever hard-coded into the application logic.
// ------------------------------------------------------------------

import type { VirtualTryOnProvider } from "./types";
import { CatVtonLocalProvider } from "./providers/catvton-local";
import { FalTryOnProvider } from "./providers/fal";
import { GeminiTryOnProvider } from "./providers/gemini";

const PROVIDERS: VirtualTryOnProvider[] = [
  new CatVtonLocalProvider(),
  new FalTryOnProvider(),
  new GeminiTryOnProvider(),
];

export function allProviders(): VirtualTryOnProvider[] {
  return PROVIDERS;
}

export function providerById(id: string): VirtualTryOnProvider | null {
  return PROVIDERS.find((p) => p.id === id) ?? null;
}

/** The local on-device provider, for status reporting. */
export function localProvider(): CatVtonLocalProvider {
  return PROVIDERS[0] as CatVtonLocalProvider;
}

/**
 * Resolves the active provider: the one named by TRYON_PROVIDER if it
 * is configured, otherwise the first configured provider, otherwise
 * null (nothing is configured — callers must surface setup steps).
 */
export function activeProvider(): VirtualTryOnProvider | null {
  const requested = process.env.TRYON_PROVIDER?.trim().toLowerCase();
  if (requested) {
    const match = PROVIDERS.find((p) => p.id === requested);
    if (match?.isConfigured()) return match;
  }
  return PROVIDERS.find((p) => p.isConfigured()) ?? null;
}

export interface ProviderDiagnostics {
  configured: boolean;
  activeProvider: string | null;
  activeLabel: string | null;
  activeIsLocal: boolean;
  requested: string | null;
  providers: Array<{
    id: string;
    label: string;
    configured: boolean;
    local: boolean;
    supportsModelGeneration: boolean;
    setup: string[];
  }>;
  requiredEnv: string[];
}

/** Everything the UI needs to explain what (if anything) is missing. */
export function providerDiagnostics(): ProviderDiagnostics {
  const active = activeProvider();
  return {
    configured: Boolean(active),
    activeProvider: active?.id ?? null,
    activeLabel: active?.label ?? null,
    activeIsLocal: active?.id === "catvton",
    requested: process.env.TRYON_PROVIDER?.trim().toLowerCase() ?? null,
    providers: PROVIDERS.map((p) => ({
      id: p.id,
      label: p.label,
      configured: p.isConfigured(),
      local: p.id === "catvton",
      supportsModelGeneration: p.supportsModelGeneration,
      setup: p.setupInstructions(),
    })),
    requiredEnv: [
      "VTON_ENABLED / VTON_SERVICE_URL (local CatVTON — no key)",
      "FAL_KEY (optional cloud)",
      "GEMINI_API_KEY (optional cloud)",
    ],
  };
}
