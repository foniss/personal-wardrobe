// ------------------------------------------------------------------
// Google Gemini adapter — gemini-2.5-flash-image ("nano banana").
//
// Real API:
//   POST https://generativelanguage.googleapis.com/v1beta/models/
//        gemini-2.5-flash-image:generateContent
//   x-goog-api-key: <GEMINI_API_KEY>
//   { contents:[{ parts:[ {text}, {inline_data:{mime_type,data}} ... ] }],
//     generationConfig:{ responseModalities:["TEXT","IMAGE"] } }
//   -> candidates[].content.parts[].inlineData.data (base64)
//
// Unlike single-garment VTON models, this composes the whole outfit —
// including shoes and accessories — in one call, because it accepts
// many reference images at once. The prompt is explicitly instructed
// to copy the garments from the supplied photos rather than invent
// clothing, which is what preserves colour/pattern/logo identity.
// ------------------------------------------------------------------

import {
  splitDataUri,
  type ModelGenerationOutcome,
  type ModelGenerationRequest,
  type TryOnOutcome,
  type TryOnRequest,
  type TryOnView,
  type VirtualTryOnProvider,
} from "../types";

const MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
const BASE =
  process.env.GEMINI_API_BASE ||
  process.env.TRYON_API_URL ||
  "https://generativelanguage.googleapis.com/v1beta/models";
const TIMEOUT_MS = 120_000;

const VIEW_PHRASE: Record<TryOnView, string> = {
  front: "photographed straight-on from the front",
  "three-quarter": "photographed from a three-quarter angle",
  side: "photographed from the side profile",
  back: "photographed from behind, showing the back of the outfit",
};

interface GeminiPart {
  text?: string;
  inline_data?: { mime_type: string; data: string };
  inlineData?: { mimeType?: string; data?: string };
}

function apiKey(): string {
  return process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
}

function extractImage(json: unknown): { base64: string; mimeType: string } | null {
  const candidates = (json as {
    candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
  } | null)?.candidates;
  if (!Array.isArray(candidates)) return null;
  for (const c of candidates) {
    for (const p of c.content?.parts ?? []) {
      const inline = p.inlineData ?? p.inline_data;
      if (!inline) continue;
      const data = (inline as { data?: string }).data;
      const mime =
        (inline as { mimeType?: string }).mimeType ??
        (inline as { mime_type?: string }).mime_type ??
        "image/png";
      if (data) return { base64: data, mimeType: mime };
    }
  }
  return null;
}

async function callGemini(
  parts: GeminiPart[],
  signal: AbortSignal,
): Promise<{ status: number; json: unknown; text: string }> {
  const res = await fetch(`${BASE}/${MODEL}:generateContent`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    }),
    signal,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON */
  }
  return { status: res.status, json, text };
}

export class GeminiTryOnProvider implements VirtualTryOnProvider {
  readonly id = "gemini";
  readonly label = "Google Gemini 2.5 Flash Image";
  readonly supportsModelGeneration = true;

  isConfigured(): boolean {
    return Boolean(apiKey());
  }

  setupInstructions(): string[] {
    return [
      "Create an API key at aistudio.google.com/apikey",
      "Add GEMINI_API_KEY=<your key> to the environment",
      "Set TRYON_PROVIDER=gemini",
      `Uses the ${MODEL} image model (billed per image)`,
    ];
  }

  async generateModel(req: ModelGenerationRequest): Promise<ModelGenerationOutcome> {
    if (!this.isConfigured()) {
      return {
        ok: false,
        code: "not_configured",
        message: "GEMINI_API_KEY is not set.",
        provider: this.id,
        setup: this.setupInstructions(),
      };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const { status, json, text } = await callGemini(
        [{ text: req.prompt }],
        controller.signal,
      );
      if (status === 401 || status === 403) {
        return {
          ok: false,
          code: "not_configured",
          message: "Gemini rejected the API key.",
          provider: this.id,
          setup: this.setupInstructions(),
        };
      }
      if (status !== 200) {
        return {
          ok: false,
          code: "provider_error",
          message: `Gemini model generation failed (${status}): ${text.slice(0, 200)}`,
          provider: this.id,
        };
      }
      const img = extractImage(json);
      if (!img) {
        return {
          ok: false,
          code: "content_rejected",
          message: "Gemini returned no image (the prompt may have been filtered).",
          provider: this.id,
        };
      }
      return {
        ok: true,
        image: Buffer.from(img.base64, "base64"),
        mimeType: img.mimeType,
        provider: this.id,
      };
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      return {
        ok: false,
        code: aborted ? "timeout" : "provider_error",
        message: aborted
          ? "Gemini model generation timed out."
          : `Gemini error: ${err instanceof Error ? err.message : "unknown"}`,
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
        message: "GEMINI_API_KEY is not set.",
        provider: this.id,
        setup: this.setupInstructions(),
      };
    }
    if (req.garments.length === 0) {
      return {
        ok: false,
        code: "invalid_input",
        message: "No garments supplied.",
        provider: this.id,
      };
    }

    const person = splitDataUri(req.personImageDataUri);
    if (!person) {
      return {
        ok: false,
        code: "invalid_input",
        message: "Reference photo is not a valid image.",
        provider: this.id,
      };
    }

    // Image 1 = the person. Images 2..n = the user's real garments.
    const parts: GeminiPart[] = [
      {
        text:
          "You are a virtual try-on system for a fashion catalogue.\n" +
          "IMAGE 1 is the PERSON. Every following image is a REAL garment the person owns.\n" +
          req.garments
            .map(
              (g, i) =>
                `IMAGE ${i + 2}: the ${g.role} — "${g.name}" (${g.colorName}).`,
            )
            .join("\n") +
          "\n\nProduce ONE photorealistic full-body fashion photograph of the person from " +
          "IMAGE 1 wearing ALL of the garments shown in the following images at the same time.\n" +
          "STRICT RULES:\n" +
          "- Preserve the person's face, identity, skin tone, hair and body proportions exactly.\n" +
          "- Copy each garment EXACTLY as pictured: same colour, pattern, print, texture, " +
          "cut, length, buttons, logos and branding. Do NOT invent or substitute clothing.\n" +
          "- Fit the garments naturally to the body with correct drape, folds, occlusion and shadow.\n" +
          `- The subject is ${VIEW_PHRASE[req.view]}, standing in a relaxed natural pose.\n` +
          "- Clean neutral studio backdrop, soft even editorial lighting, sharp focus, full body " +
          "visible including footwear.\n" +
          "- Output a realistic PHOTOGRAPH. Not an illustration, not a cartoon, not a 3D render.",
      },
      { inline_data: { mime_type: person.mimeType, data: person.base64 } },
    ];

    for (const g of req.garments) {
      const parsed = splitDataUri(g.imageDataUri);
      if (!parsed) continue;
      parts.push({
        inline_data: { mime_type: parsed.mimeType, data: parsed.base64 },
      });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const { status, json, text } = await callGemini(parts, controller.signal);
      if (status === 401 || status === 403) {
        return {
          ok: false,
          code: "not_configured",
          message: "Gemini rejected the API key.",
          provider: this.id,
          setup: this.setupInstructions(),
        };
      }
      if (status === 400) {
        return {
          ok: false,
          code: "invalid_input",
          message: `Gemini rejected the request: ${text.slice(0, 200)}`,
          provider: this.id,
        };
      }
      if (status !== 200) {
        return {
          ok: false,
          code: "provider_error",
          message: `Gemini try-on failed (${status}): ${text.slice(0, 200)}`,
          provider: this.id,
        };
      }
      const img = extractImage(json);
      if (!img) {
        return {
          ok: false,
          code: "content_rejected",
          message:
            "Gemini returned no image — the request may have been filtered. Try a different reference photo.",
          provider: this.id,
        };
      }
      return {
        ok: true,
        image: Buffer.from(img.base64, "base64"),
        mimeType: img.mimeType,
        provider: this.id,
        // composes the full outfit, including shoes/accessories
        unsupported: [],
      };
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      return {
        ok: false,
        code: aborted ? "timeout" : "provider_error",
        message: aborted
          ? "Gemini try-on timed out."
          : `Gemini error: ${err instanceof Error ? err.message : "unknown"}`,
        provider: this.id,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
