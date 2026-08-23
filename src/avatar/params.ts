// ------------------------------------------------------------------
// Character parameter model: types, option catalogs, defaults,
// and validation. Pure & client-safe — used by the creator UI,
// the API route and the renderer. Designed to be extended with
// more hairstyles, builds, accessories, poses later.
// ------------------------------------------------------------------

export type Gender = "female" | "male";
export type Build = "slim" | "average" | "broad";

export interface CharacterParams {
  gender: Gender;
  heightCm: number;
  weightKg: number | null;
  build: Build;
  skinTone: string;
  hairstyle: string;
  hairColor: string;
  beardStyle: string;
  glasses: boolean;
}

export const GENDERS: ReadonlyArray<{ id: Gender; label: string }> = [
  { id: "female", label: "Female" },
  { id: "male", label: "Male" },
];

export const BUILDS: ReadonlyArray<{ id: Build; label: string }> = [
  { id: "slim", label: "Slim" },
  { id: "average", label: "Average" },
  { id: "broad", label: "Broad" },
];

export const SKIN_TONES: ReadonlyArray<{ id: string; label: string; hex: string }> = [
  { id: "tone-1", label: "Tone 1", hex: "#f3d7c0" },
  { id: "tone-2", label: "Tone 2", hex: "#eec39e" },
  { id: "tone-3", label: "Tone 3", hex: "#d9a97e" },
  { id: "tone-4", label: "Tone 4", hex: "#bd8a5f" },
  { id: "tone-5", label: "Tone 5", hex: "#8f613d" },
  { id: "tone-6", label: "Tone 6", hex: "#5f3d26" },
];

export const HAIRSTYLES: ReadonlyArray<{ id: string; label: string }> = [
  { id: "short", label: "Short" },
  { id: "fade", label: "Fade" },
  { id: "medium", label: "Medium" },
  { id: "wavy", label: "Wavy" },
  { id: "curly", label: "Curly" },
  { id: "long", label: "Long" },
  { id: "bob", label: "Bob" },
  { id: "ponytail", label: "Ponytail" },
];

export const HAIR_COLORS: ReadonlyArray<{ hex: string; label: string }> = [
  { hex: "#201a16", label: "Ink black" },
  { hex: "#3a2417", label: "Espresso" },
  { hex: "#6b3c1e", label: "Chestnut" },
  { hex: "#a8501f", label: "Ginger" },
  { hex: "#c39a54", label: "Golden" },
  { hex: "#b7a37e", label: "Ash blonde" },
  { hex: "#b9b4ac", label: "Silver" },
];

export const BEARD_STYLES: ReadonlyArray<{ id: string; label: string }> = [
  { id: "none", label: "None" },
  { id: "stubble", label: "Stubble" },
  { id: "short", label: "Short beard" },
  { id: "full", label: "Full beard" },
  { id: "mustache", label: "Mustache" },
];

export const HEIGHT_RANGE = { min: 140, max: 205 } as const;
export const WEIGHT_RANGE = { min: 38, max: 200 } as const;

export const DEFAULT_CHARACTER: CharacterParams = {
  gender: "female",
  heightCm: 168,
  weightKg: null,
  build: "average",
  skinTone: "tone-3",
  hairstyle: "medium",
  hairColor: "#3a2417",
  beardStyle: "none",
  glasses: false,
};

export function skinToneHex(id: string): string {
  return SKIN_TONES.find((t) => t.id === id)?.hex ?? SKIN_TONES[2].hex;
}

export function isHairColor(hex: string): boolean {
  return HAIR_COLORS.some((c) => c.hex.toLowerCase() === hex.toLowerCase());
}

// ------------------------------- validation --------------------------

type ValidationResult =
  | { ok: true; value: CharacterParams }
  | { ok: false; error: string };

export function validateCharacter(input: unknown): ValidationResult {
  if (typeof input !== "object" || input === null) {
    return { ok: false, error: "Character settings are required." };
  }
  const raw = input as Record<string, unknown>;
  const value: CharacterParams = { ...DEFAULT_CHARACTER };

  if (raw.gender !== undefined) {
    if (raw.gender !== "female" && raw.gender !== "male") {
      return { ok: false, error: "Gender must be 'female' or 'male'." };
    }
    value.gender = raw.gender;
  }

  if (raw.heightCm !== undefined && raw.heightCm !== null) {
    const h = Number(raw.heightCm);
    if (!Number.isFinite(h) || h < HEIGHT_RANGE.min || h > HEIGHT_RANGE.max) {
      return {
        ok: false,
        error: `Height must be between ${HEIGHT_RANGE.min} and ${HEIGHT_RANGE.max} cm.`,
      };
    }
    value.heightCm = Math.round(h);
  }

  if (raw.weightKg !== undefined) {
    if (raw.weightKg === null || raw.weightKg === "") {
      value.weightKg = null;
    } else {
      const w = Number(raw.weightKg);
      if (!Number.isFinite(w) || w < WEIGHT_RANGE.min || w > WEIGHT_RANGE.max) {
        return {
          ok: false,
          error: `Weight must be between ${WEIGHT_RANGE.min} and ${WEIGHT_RANGE.max} kg.`,
        };
      }
      value.weightKg = Math.round(w);
    }
  }

  if (raw.build !== undefined) {
    if (!BUILDS.some((b) => b.id === raw.build)) {
      return { ok: false, error: "Unknown build." };
    }
    value.build = raw.build as Build;
  }

  if (raw.skinTone !== undefined) {
    if (!SKIN_TONES.some((t) => t.id === raw.skinTone)) {
      return { ok: false, error: "Unknown skin tone." };
    }
    value.skinTone = String(raw.skinTone);
  }

  if (raw.hairstyle !== undefined) {
    if (!HAIRSTYLES.some((s) => s.id === raw.hairstyle)) {
      return { ok: false, error: "Unknown hairstyle." };
    }
    value.hairstyle = String(raw.hairstyle);
  }

  if (raw.hairColor !== undefined) {
    const hex = String(raw.hairColor);
    if (!isHairColor(hex)) {
      return { ok: false, error: "Unknown hair colour." };
    }
    value.hairColor = hex.toLowerCase();
  }

  if (raw.beardStyle !== undefined) {
    if (!BEARD_STYLES.some((b) => b.id === raw.beardStyle)) {
      return { ok: false, error: "Unknown beard style." };
    }
    value.beardStyle = String(raw.beardStyle);
  }

  if (raw.glasses !== undefined) {
    value.glasses = Boolean(raw.glasses);
  }

  // Facial hair only exists on the male preset.
  if (value.gender === "female") value.beardStyle = "none";

  return { ok: true, value };
}
