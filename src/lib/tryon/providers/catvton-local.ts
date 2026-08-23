// ------------------------------------------------------------------
// Local CatVTON adapter.
//
//   Next.js  →  TryOnService  →  this provider
//            →  HTTP 127.0.0.1  →  vton-service/server.py
//            →  CatVTON (local weights)  →  generated image
//
// Nothing leaves the machine: no API key, no cloud, no image hosting.
//
// MILESTONE 1 (deliberate): CatVTON's inference is person + ONE
// garment. This adapter therefore visualizes a single primary garment
// per generation and reports the remaining outfit pieces back as
// `unsupported`, so the UI can be honest about what is rendered.
// Multi-garment chaining is a later milestone.
//
// CatVTON is CC BY-NC-SA 4.0 — non-commercial use only.
// ------------------------------------------------------------------

import {
  splitDataUri,
  type GarmentInput,
  type ModelGenerationOutcome,
  type ModelGenerationRequest,
  type TryOnOutcome,
  type TryOnRequest,
  type VirtualTryOnProvider,
} from "../types";

export const CATVTON_DEFAULT_URL = "http://127.0.0.1:8188";

/** CatVTON's three mask categories. */
type ClothType = "upper" | "lower" | "overall";

/** Which garment gets visualized, most reliable first. */
const GARMENT_PRIORITY: Array<{ role: GarmentInput["role"]; cloth: ClothType }> = [
  { role: "one-piece", cloth: "overall" },
  { role: "top", cloth: "upper" },
  { role: "bottom", cloth: "lower" },
  { role: "outerwear", cloth: "upper" },
];

export interface VtonHealth {
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
    repo_id: string;
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
    cuda_version: string | null;
    hip_version: string | null;
    mps_available: boolean;
    directml_available: boolean;
    devices: Array<{ name: string; total_memory_gb: number; arch: string }>;
    device: string | null;
    device_reason: string;
    allow_cpu: boolean;
  };
  capabilities?: {
    max_garments_per_request: number;
    cloth_types: string[];
    auto_mask: boolean;
  };
  reasons: string[];
  license?: string;
  error?: string;
}

function serviceUrl(): string {
  return (
    process.env.VTON_SERVICE_URL?.trim().replace(/\/+$/, "") || CATVTON_DEFAULT_URL
  );
}

function timeoutMs(): number {
  const raw = Number(process.env.VTON_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 600_000; // 10 min
}

export class CatVtonLocalProvider implements VirtualTryOnProvider {
  readonly id = "catvton";
  readonly label = "CatVTON (local)";
  // Realistic person synthesis is a different model class; not local here.
  readonly supportsModelGeneration = false;

  isConfigured(): boolean {
    // No credentials exist for a local service — it is "configured" as
    // long as it has not been explicitly disabled. Whether it is
    // actually *running* is answered by health().
    return process.env.VTON_ENABLED?.trim().toLowerCase() !== "false";
  }

  setupInstructions(): string[] {
    return [
      "Runs locally — no API key, no cloud, images never leave your machine",
      "1) pip install -r vton-service/requirements.txt (plus a PyTorch build for your GPU)",
      "2) git clone https://github.com/Zheng-Chong/CatVTON && set CATVTON_PATH to it",
      "3) python vton-service/server.py",
      `4) Set VTON_SERVICE_URL=${serviceUrl()} (default) and VTON_ENABLED=true`,
      "Requires an NVIDIA/CUDA GPU (~8 GB VRAM). CatVTON is CC BY-NC-SA 4.0 (non-commercial)",
    ];
  }

  /** Live diagnostics from the Python service — used by the status pill. */
  async health(): Promise<VtonHealth> {
    const url = serviceUrl();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const res = await fetch(`${url}/health`, { signal: controller.signal });
      if (!res.ok) {
        return {
          reachable: true,
          status: "unavailable",
          ready: false,
          serviceUrl: url,
          reasons: [`Service responded with HTTP ${res.status}.`],
        };
      }
      const data = (await res.json()) as Record<string, unknown>;
      return {
        reachable: true,
        status: data.ready ? "ready" : "unavailable",
        ready: Boolean(data.ready),
        serviceUrl: url,
        model: data.model as VtonHealth["model"],
        backend: data.backend as VtonHealth["backend"],
        capabilities: data.capabilities as VtonHealth["capabilities"],
        reasons: Array.isArray(data.reasons) ? (data.reasons as string[]) : [],
        license: typeof data.license === "string" ? data.license : undefined,
      };
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      return {
        reachable: false,
        status: "unreachable",
        ready: false,
        serviceUrl: url,
        reasons: [
          aborted
            ? `No response from ${url} (timed out).`
            : `Local virtual try-on is not running at ${url}.`,
        ],
        error: aborted ? "timeout" : "connection_refused",
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async generateModel(_req: ModelGenerationRequest): Promise<ModelGenerationOutcome> {
    void _req;
    return {
      ok: false,
      code: "not_configured",
      message:
        "The local CatVTON provider performs try-on only — it cannot synthesize a " +
        "reference person. Upload a full-body photo instead.",
      provider: this.id,
      setup: [
        "Go to My Model → 'Upload myself' and add a full-body photo",
        "CatVTON needs a real person photograph as its base image",
      ],
    };
  }

  /** Chooses the single garment to visualize for this generation. */
  private pickGarment(
    garments: GarmentInput[],
    preferredItemId?: string,
  ): { garment: GarmentInput; cloth: ClothType } | null {
    if (preferredItemId) {
      const forced = garments.find((g) => g.itemId === preferredItemId);
      const entry = forced
        ? GARMENT_PRIORITY.find((p) => p.role === forced.role)
        : undefined;
      if (forced && entry) return { garment: forced, cloth: entry.cloth };
    }
    for (const { role, cloth } of GARMENT_PRIORITY) {
      const match = garments.find((g) => g.role === role);
      if (match) return { garment: match, cloth };
    }
    return null;
  }

  async tryOn(req: TryOnRequest): Promise<TryOnOutcome> {
    if (!this.isConfigured()) {
      return {
        ok: false,
        code: "not_configured",
        message: "Local virtual try-on is disabled (VTON_ENABLED=false).",
        provider: this.id,
        setup: this.setupInstructions(),
      };
    }

    if (req.view !== "front") {
      return {
        ok: false,
        code: "invalid_input",
        message:
          "CatVTON reproduces the pose of the reference photo, so only the Front view is available.",
        provider: this.id,
      };
    }

    const person = splitDataUri(req.personImageDataUri);
    if (!person) {
      return {
        ok: false,
        code: "invalid_input",
        message: "The reference photo is not a readable image.",
        provider: this.id,
      };
    }

    const picked = this.pickGarment(
      req.garments,
      typeof req.settings?.primaryItemId === "string"
        ? (req.settings.primaryItemId as string)
        : undefined,
    );
    if (!picked) {
      return {
        ok: false,
        code: "invalid_input",
        message:
          "CatVTON can fit a top, a bottom or a dress — none of those were in this outfit.",
        provider: this.id,
      };
    }

    const garment = splitDataUri(picked.garment.imageDataUri);
    if (!garment) {
      return {
        ok: false,
        code: "invalid_input",
        message: `Could not read the image for "${picked.garment.name}".`,
        provider: this.id,
      };
    }

    // Everything we are not rendering this pass.
    const unsupported = req.garments
      .filter((g) => g.itemId !== picked.garment.itemId)
      .map((g) => g.itemId);

    const url = serviceUrl();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs());

    try {
      const res = await fetch(`${url}/try-on`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          // the user's ACTUAL photos, base64 — never a text description
          person: person.base64,
          garment: garment.base64,
          cloth_type: picked.cloth,
          ...(typeof req.settings?.steps === "number"
            ? { steps: req.settings.steps }
            : {}),
          ...(typeof req.settings?.guidanceScale === "number"
            ? { guidance_scale: req.settings.guidanceScale }
            : {}),
          ...(typeof req.settings?.seed === "number"
            ? { seed: req.settings.seed }
            : {}),
        }),
      });

      const text = await res.text();
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(text) as Record<string, unknown>;
      } catch {
        return {
          ok: false,
          code: "provider_error",
          message: `Unreadable response from the local service (HTTP ${res.status}).`,
          provider: this.id,
        };
      }

      if (res.status === 503) {
        return {
          ok: false,
          code: "not_configured",
          message: String(data.error ?? "The local CatVTON model is not installed."),
          provider: this.id,
          setup: this.setupInstructions(),
        };
      }
      if (res.status === 400 || res.status === 413) {
        return {
          ok: false,
          code: "invalid_input",
          message: String(data.error ?? "The local service rejected the images."),
          provider: this.id,
        };
      }
      if (!res.ok || !data.success) {
        return {
          ok: false,
          code: "provider_error",
          message: String(
            data.error ?? `Local try-on failed (HTTP ${res.status}).`,
          ),
          provider: this.id,
        };
      }

      const b64 = typeof data.image === "string" ? data.image : "";
      if (!b64) {
        return {
          ok: false,
          code: "provider_error",
          message: "The local service returned no image.",
          provider: this.id,
        };
      }

      return {
        ok: true,
        image: Buffer.from(b64, "base64"),
        mimeType: typeof data.mime_type === "string" ? data.mime_type : "image/png",
        provider: this.id,
        unsupported,
      };
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      if (aborted) {
        return {
          ok: false,
          code: "timeout",
          message: `Local generation exceeded ${Math.round(timeoutMs() / 1000)}s. On CPU this is expected — use a CUDA GPU or raise VTON_TIMEOUT_MS.`,
          provider: this.id,
        };
      }
      return {
        ok: false,
        code: "provider_error",
        message: `Local virtual try-on is not running at ${url}. Start it with: python vton-service/server.py`,
        provider: this.id,
        setup: this.setupInstructions(),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
