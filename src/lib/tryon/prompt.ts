// ------------------------------------------------------------------
// Builds the text prompt used to synthesize a realistic reference
// model. Deliberately photographic language — never illustration,
// avatar, render or character vocabulary.
// ------------------------------------------------------------------

import {
  BEARD_STYLES,
  BUILDS,
  HAIRSTYLES,
  HAIR_COLORS,
  SKIN_TONES,
  type CharacterParams,
} from "@/avatar/params";

function label<T extends { id: string; label: string }>(
  list: ReadonlyArray<T>,
  id: string,
): string {
  return list.find((x) => x.id === id)?.label.toLowerCase() ?? id;
}

const SKIN_PHRASE: Record<string, string> = {
  "tone-1": "very fair",
  "tone-2": "fair",
  "tone-3": "light-medium",
  "tone-4": "medium tan",
  "tone-5": "deep brown",
  "tone-6": "dark brown",
};

const BUILD_PHRASE: Record<string, string> = {
  slim: "slim, lean build",
  average: "average, balanced build",
  broad: "broad, solid build",
};

export function buildModelPrompt(p: CharacterParams): string {
  const gender = p.gender === "male" ? "man" : "woman";
  const hair = label(HAIRSTYLES, p.hairstyle);
  const hairColor =
    HAIR_COLORS.find((c) => c.hex.toLowerCase() === p.hairColor.toLowerCase())
      ?.label.toLowerCase() ?? "dark brown";
  const skin = SKIN_PHRASE[p.skinTone] ?? label(SKIN_TONES, p.skinTone);
  const build = BUILD_PHRASE[p.build] ?? label(BUILDS, p.build);

  const details: string[] = [
    `${skin} skin tone`,
    `${hair} ${hairColor} hair`,
    `${build}`,
    `approximately ${p.heightCm} cm tall`,
  ];

  if (p.gender === "male" && p.beardStyle !== "none") {
    details.push(`${label(BEARD_STYLES, p.beardStyle)} facial hair`);
  }
  if (p.glasses) details.push("wearing clear eyeglasses");

  return [
    `A photorealistic full-body studio fashion photograph of an adult ${gender}`,
    `with ${details.join(", ")}.`,
    "Standing straight, facing the camera, relaxed neutral pose, arms slightly away from the body,",
    "both feet fully visible in frame, head to toe.",
    "Wearing plain fitted neutral grey athletic base layers (simple t-shirt and leggings) so clothing can be swapped later.",
    "Clean seamless light grey studio backdrop, soft even diffused lighting, no harsh shadows,",
    "shot on an 85mm lens, sharp focus, high detail, professional e-commerce model photography.",
    "This must look like a real photograph of a real person — not an illustration, not a painting,",
    "not a 3D render, not a cartoon, not an avatar.",
  ].join(" ");
}

/** Deterministic seed so regenerating keeps the identity close. */
export function seedForModel(p: CharacterParams): number {
  const s = JSON.stringify(p);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 2_147_483_647;
}
