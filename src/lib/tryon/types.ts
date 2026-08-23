// ------------------------------------------------------------------
// Virtual try-on provider contract.
//
// The try-on layer knows nothing about outfit quality or scoring —
// it only turns (reference person + real garment images) into a
// realistic photograph. The matcher decides WHAT to wear; this
// decides how it LOOKS.
// ------------------------------------------------------------------

/** Garment roles a provider may need to distinguish. */
export type GarmentRole =
  | "top"
  | "bottom"
  | "one-piece"
  | "outerwear"
  | "shoes"
  | "accessory";

export type TryOnView = "front" | "three-quarter" | "side" | "back";

export const TRY_ON_VIEWS: ReadonlyArray<{
  id: TryOnView;
  label: string;
  /** views beyond front need provider re-synthesis; gated in v1 */
  enabled: boolean;
}> = [
  { id: "front", label: "Front", enabled: true },
  { id: "three-quarter", label: "3/4", enabled: false },
  { id: "side", label: "Side", enabled: false },
  { id: "back", label: "Back", enabled: false },
];

/** One real garment from the user's wardrobe. */
export interface GarmentInput {
  itemId: string;
  role: GarmentRole;
  /** the user's ACTUAL clothing photo, as a data URI */
  imageDataUri: string;
  /** descriptive context only — never a substitute for the image */
  name: string;
  colorName: string;
}

export interface TryOnRequest {
  /** reference person photo (uploaded or generated), as a data URI */
  personImageDataUri: string;
  garments: GarmentInput[];
  view: TryOnView;
  /** free-form provider tuning */
  settings?: Record<string, unknown>;
}

export interface TryOnSuccess {
  ok: true;
  /** raw generated image bytes */
  image: Buffer;
  mimeType: string;
  provider: string;
  /** garments the provider could not physically apply (e.g. shoes on a VTON model) */
  unsupported: string[];
}

export type TryOnErrorCode =
  | "not_configured"
  | "invalid_input"
  | "provider_error"
  | "timeout"
  | "content_rejected";

export interface TryOnFailure {
  ok: false;
  code: TryOnErrorCode;
  message: string;
  provider: string;
  /** actionable setup steps when code === 'not_configured' */
  setup?: string[];
}

export type TryOnOutcome = TryOnSuccess | TryOnFailure;

/** Parameters for synthesizing a reusable virtual model photo. */
export interface ModelGenerationRequest {
  prompt: string;
  /** stabilizes identity across regenerations where supported */
  seed?: number;
}

export type ModelGenerationOutcome =
  | { ok: true; image: Buffer; mimeType: string; provider: string }
  | { ok: false; code: TryOnErrorCode; message: string; provider: string; setup?: string[] };

/**
 * A swappable virtual try-on backend. Add new providers by
 * implementing this interface and registering them in registry.ts.
 */
export interface VirtualTryOnProvider {
  readonly id: string;
  readonly label: string;
  /** true when every required env var is present */
  isConfigured(): boolean;
  /** human-readable setup steps, shown in the UI when unconfigured */
  setupInstructions(): string[];
  /** can this provider synthesize a reference person from text? */
  readonly supportsModelGeneration: boolean;
  generateModel(req: ModelGenerationRequest): Promise<ModelGenerationOutcome>;
  tryOn(req: TryOnRequest): Promise<TryOnOutcome>;
  /**
   * Optional live diagnostics. Local providers implement this so the UI
   * can show whether the on-device service is actually running.
   */
  health?(): Promise<unknown>;
}

// ------------------------------------------------------------- helpers

export function dataUriToBuffer(uri: string): { buffer: Buffer; mimeType: string } | null {
  const m = /^data:([^;,]+);base64,([\s\S]*)$/.exec(uri);
  if (!m) return null;
  return { buffer: Buffer.from(m[2], "base64"), mimeType: m[1] };
}

export function splitDataUri(uri: string): { mimeType: string; base64: string } | null {
  const m = /^data:([^;,]+);base64,([\s\S]*)$/.exec(uri);
  if (!m) return null;
  return { mimeType: m[1], base64: m[2] };
}

/** Wardrobe category → provider-facing garment role. */
export function roleForCategory(category: string): GarmentRole {
  switch (category) {
    case "tops":
      return "top";
    case "bottoms":
      return "bottom";
    case "dresses":
      return "one-piece";
    case "outerwear":
      return "outerwear";
    case "shoes":
      return "shoes";
    default:
      return "accessory";
  }
}
