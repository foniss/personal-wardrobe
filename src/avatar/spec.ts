// ------------------------------------------------------------------
// Garment specs: translate a WardrobeItem (id/category/colours/name)
// into a renderable garment description for the avatar. No manual
// per-item assets required — silhouettes derive from category and
// name heuristics, colours from the extracted palette. Every item
// always resolves to *something* renderable (fallbacks per category).
// ------------------------------------------------------------------

import { hexToRgb } from "@/lib/colors";
import type { WardrobeItem } from "@/lib/types";
import { shadeHex } from "./geometry";

export type GarmentKind =
  | "top"
  | "bottom"
  | "shoes"
  | "outerwear"
  | "accessory"
  | "dress";

export interface GarmentColors {
  main: string;
  shade: string;
  light: string;
  accent: string;
}

export interface GarmentSpec {
  itemId: string;
  kind: GarmentKind;
  /** e.g. "tshirt" | "sweater" | "jeans" | "coat" | "scarf" — silhouette variant */
  subtype: string;
  /** rendering zone: body-zone draws under the head, head-zone over it */
  zone: "body" | "head";
  colors: GarmentColors;
  /** fit widens/narrows silhouettes slightly */
  fit: "standard" | "boxy" | "slim";
}

function rgbDistHex(a: string, b: string): number {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return Math.sqrt((A.r - B.r) ** 2 + (A.g - B.g) ** 2 + (A.b - B.b) ** 2);
}

const CATEGORY_KIND: Record<WardrobeItem["category"], GarmentKind> = {
  tops: "top",
  bottoms: "bottom",
  shoes: "shoes",
  outerwear: "outerwear",
  accessories: "accessory",
  dresses: "dress",
};

function pickSubtype(kind: GarmentKind, name: string): string {
  const n = name.toLowerCase();
  const has = (...words: string[]) => words.some((w) => n.includes(w));

  switch (kind) {
    case "top":
      if (has("hoodie")) return "hoodie";
      if (has("sweater", "knit", "jumper", "cardigan", "pullover")) return "sweater";
      if (has("overshirt", "shacket", "flannel")) return "overshirt";
      if (has("tank", "singlet", "camisole", "vest top")) return "tank";
      if (has("crop")) return "crop";
      if (has("t-shirt", "tshirt", "tee", "polo", "henley")) return "tshirt";
      if (has("shirt", "oxford", "blouse", "button")) return "shirt";
      return "longsleeve";
    case "bottom":
      if (has("shorts")) return "shorts";
      if (has("skirt")) return has("maxi") ? "maxiskirt" : has("mini") ? "miniskirt" : "skirt";
      if (has("jean", "denim")) return "jeans";
      if (has("cargo")) return "cargo";
      if (has("legging")) return "leggings";
      return "trousers";
    case "shoes":
      if (has("heel", "pump", "stiletto", "slingback")) return "heels";
      if (has("sandal", "slide", "flip")) return "sandals";
      if (has("boot", "chelsea", "martens", "derby")) return "boots";
      if (has("loafer", "flat", "ballet", "mule")) return "flats";
      return "sneakers";
    case "outerwear":
      if (has("puffer", "parka")) return "puffer";
      if (has("blazer")) return "blazer";
      if (has("trench", "overcoat", "coat", "duster", "wool")) return "coat";
      return "jacket";
    case "accessory":
      if (has("scarf")) return "scarf";
      if (has("beanie", "cap", "hat", "bucket")) return "hat";
      if (has("tote", "bag", "purse", "shopper", "satchel")) return "tote";
      if (has("watch")) return "watch";
      if (has("belt")) return "belt";
      if (has("necklace", "pendant", "chain", "choker")) return "pendant";
      return "pendant";
    case "dress":
      if (has("maxi", "gown")) return "maxidress";
      if (has("mini")) return "minidress";
      if (has("slip", "bodycon")) return "slipdress";
      if (has("shirt")) return "shirtdress";
      return "dress";
  }
}

function pickFit(name: string, tags: string[]): GarmentSpec["fit"] {
  const hay = `${name.toLowerCase()} ${tags.join(" ")}`;
  if (/\boversized|boxy|relaxed|wide\b/.test(hay)) return "boxy";
  if (/\bslim|fitted|skinny|tailored\b/.test(hay)) return "slim";
  return "standard";
}

const HEAD_ZONE = new Set(["hat", "scarf"]);

export function garmentSpecFromItem(item: WardrobeItem): GarmentSpec {
  const kind = CATEGORY_KIND[item.category];
  const subtype = pickSubtype(kind, item.name);

  const main = item.colorHex;
  const shade = shadeHex(main, -26);
  const light = shadeHex(main, 30);
  const alt =
    item.palette.find((hex) => rgbDistHex(hex, main) > 55) ??
    item.palette[1] ??
    shade;

  return {
    itemId: item.id,
    kind,
    subtype,
    zone: HEAD_ZONE.has(subtype) ? "head" : "body",
    colors: { main, shade, light, accent: alt },
    fit: pickFit(item.name, item.tags),
  };
}
