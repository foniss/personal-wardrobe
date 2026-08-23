// ------------------------------------------------------------------
// fal.ai adapter — FASHN Virtual Try-On v1.6 (garment-preserving).
//
// Real API:
//   POST https://fal.run/fal-ai/fashn/tryon/v1.6
//   Authorization: Key <FAL_KEY>
//   { model_image, garment_image, category, mode, garment_photo_type }
//   -> { images: [{ url }] }
//
// FASHN applies ONE garment per call, so a full outfit is produced by
// chaining: person -> +top -> +bottom -> +outerwear, feeding each
// result forward. Inputs are sent as base64 data URIs so we never
// have to expose the user's private photos on a public URL.
//
// Model generation uses FLUX schnell text-to-image on the same key.
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

const FAL_BASE = process.env.FAL_API_BASE || process.env.TRYON_API_URL || "https://fal.run";
const TRYON_ENDPOINT = `${FAL_BASE}/fal-ai/fashn/tryon/v1.6`;
const TEXT2IMG_ENDPOINT = `${FAL_BASE}/fal-ai/flux/schnell`;
const TIMEOUT_MS = 120_000;

/** FASHN garment categories. Roles outside this set can't be applied. */
const CATEGORY: Partial<Record<GarmentInput["role"], string>> = {
  top: "tops",
  bottom: "bottoms",
  "one-piece": "one-pieces",
  outerwear: "tops",
};

/** Chaining order — base layers first, outerwear last. */
const ORDER: GarmentInput["role"][] = ["one-piece", "top", "bottom", "outerwear"];

function authHeader(): string {
  return `Key ${process.env.FAL_KEY ?? process.env.TRYON_API_KEY ?? ""}`;
}

async function postJson(
  url: string,
  body: unknown,
  signal: AbortSignal,
): Promise<{ status: number; json: unknown; text: string }> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON error body */
  }
  return { status: res.status, json, text };
}

function firstImageUrl(json: unknown): string | null {
  const images = (json as { images?: Array<{ url?: string }> } | null)?.images;
  if (Array.isArray(images) && images[0]?.url) return images[0].url;
  const single = (json as { image?: { url?: string } } | null)?.image;
  return single?.url ?? null;
}

async function fetchImage(url: string, signal: AbortSignal) {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`could not download result (${res.status})`);
  const mimeType = res.headers.get("content-type") ?? "image/png";
  return { buffer: Buffer.from(await res.arrayBuffer()), mimeType };
}

export class FalTryOnProvider implements VirtualTryOnProvider {
  readonly id = "fal";
  readonly label = "fal.ai — FASHN Try-On v1.6";
  readonly supportsModelGeneration = true;

  isConfigured(): boolean {
    return Boolean(process.env.FAL_KEY || process.env.TRYON_API_KEY);
  }

  setupInstructions(): string[] {
    return [
      "Create an API key at fal.ai/dashboard/keys",
      "Add FAL_KEY=<your key> to the environment",
      "Set TRYON_PROVIDER=fal",
      "Uses fal-ai/fashn/tryon/v1.6 (~$0.075 per generation)",
    ];
  }

  async generateModel(req: ModelGenerationRequest): Promise<ModelGenerationOutcome> {
    if (!this.isConfigured()) {
      return {
        ok: false,
        code: "not_configured",
        message: "FAL_KEY is not set.",
        provider: this.id,
        setup: this.setupInstructions(),
      };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const { status, json, text } = await postJson(
        TEXT2IMG_ENDPOINT,
        {
          prompt: req.prompt,
          image_size: "portrait_4_3",
          num_images: 1,
          enable_safety_checker: true,
          ...(req.seed !== undefined ? { seed: req.seed } : {}),
        },
        controller.signal,
      );
      if (status !== 200) {
        return {
          ok: false,
          code: status === 401 || status === 403 ? "not_configured" : "provider_error",
          message: `fal model generation failed (${status}): ${text.slice(0, 200)}`,
          provider: this.id,
        };
      }
      const url = firstImageUrl(json);
      if (!url) {
        return {
          ok: false,
          code: "provider_error",
          message: "fal returned no image.",
          provider: this.id,
        };
      }
      const img = await fetchImage(url, controller.signal);
      return { ok: true, image: img.buffer, mimeType: img.mimeType, provider: this.id };
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      return {
        ok: false,
        code: aborted ? "timeout" : "provider_error",
        message: aborted
          ? "fal model generation timed out."
          : `fal model generation error: ${err instanceof Error ? err.message : "unknown"}`,
        provider: this.id,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async tryOn(req: TryOnRequest): Promise<TryOnOutcome> {
    if (!this.isConfigured()) {
      return {
        ok: false,
        code: "not_configured",
        message: "FAL_KEY is not set.",
        provider: this.id,
        setup: this.setupInstructions(),
      };
    }

    const applicable = ORDER.flatMap((role) =>
      req.garments.filter((g) => g.role === role && CATEGORY[g.role]),
    );
    const unsupported = req.garments
      .filter((g) => !CATEGORY[g.role])
      .map((g) => g.itemId);

    if (applicable.length === 0) {
      return {
        ok: false,
        code: "invalid_input",
        message:
          "This provider can only fit tops, bottoms, dresses and outerwear — none were in the outfit.",
        provider: this.id,
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      // chain each garment onto the running result
      let current = req.personImageDataUri;
      let lastMime = "image/png";

      for (const garment of applicable) {
        const { status, json, text } = await postJson(
          TRYON_ENDPOINT,
          {
            model_image: current,
            garment_image: garment.imageDataUri,
            category: CATEGORY[garment.role],
            mode: "quality",
            garment_photo_type: "auto",
            moderation_level: "permissive",
            segmentation_free: true,
            num_samples: 1,
            output_format: "png",
          },
          controller.signal,
        );

        if (status === 401 || status === 403) {
          return {
            ok: false,
            code: "not_configured",
            message: "fal rejected the API key.",
            provider: this.id,
            setup: this.setupInstructions(),
          };
        }
        if (status === 422 || status === 400) {
          return {
            ok: false,
            code: "invalid_input",
            message: `fal rejected the images: ${text.slice(0, 200)}`,
            provider: this.id,
          };
        }
        if (status !== 200) {
          return {
            ok: false,
            code: "provider_error",
            message: `fal try-on failed (${status}): ${text.slice(0, 200)}`,
            provider: this.id,
          };
        }

        const url = firstImageUrl(json);
        if (!url) {
          return {
            ok: false,
            code: "provider_error",
            message: "fal returned no image.",
            provider: this.id,
          };
        }
        const img = await fetchImage(url, controller.signal);
        lastMime = img.mimeType;
        current = `data:${img.mimeType};base64,${img.buffer.toString("base64")}`;
      }

      const parts = splitDataUri(current);
      if (!parts) {
        return {
          ok: false,
          code: "provider_error",
          message: "fal produced an unreadable result.",
          provider: this.id,
        };
      }
      return {
        ok: true,
        image: Buffer.from(parts.base64, "base64"),
        mimeType: lastMime,
        provider: this.id,
        unsupported,
      };
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      return {
        ok: false,
        code: aborted ? "timeout" : "provider_error",
        message: aborted
          ? "fal try-on timed out."
          : `fal try-on error: ${err instanceof Error ? err.message : "unknown"}`,
        provider: this.id,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
