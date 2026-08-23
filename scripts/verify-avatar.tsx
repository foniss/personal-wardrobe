/* Smoke-render the avatar across all option catalogs + every seed
   garment, to prove the renderer never crashes and always emits SVG. */
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { Avatar } from "../src/avatar/avatar";
import {
  HAIRSTYLES,
  HAIR_COLORS,
  BEARD_STYLES,
  SKIN_TONES,
  BUILDS,
  DEFAULT_CHARACTER,
  type CharacterParams,
} from "../src/avatar/params";
import type { Category, WardrobeItem } from "../src/lib/types";

function fakeItem(name: string, category: Category, colorHex: string): WardrobeItem {
  return {
    id: name,
    name,
    category,
    colorName: "X",
    colorHex,
    palette: [colorHex, "#8a8378"],
    imagePath: "/x",
    tags: [],
    brand: null,
    favorite: false,
    createdAt: new Date().toISOString(),
  };
}

const outfit = [
  fakeItem("Wool Overshirt", "tops", "#6d87a3"),
  fakeItem("Slim Jean", "bottoms", "#2e4070"),
  fakeItem("Chelsea Boot", "shoes", "#242422"),
  fakeItem("Trench Coat", "outerwear", "#b4a48b"),
  fakeItem("Wool Scarf", "accessories", "#232324"),
];

let renders = 0;
let bytes = 0;
function check(c: CharacterParams, items: WardrobeItem[] = []) {
  const svg = renderToStaticMarkup(createElement(Avatar, { character: c, items }));
  if (!svg.includes("<svg")) throw new Error("no svg: " + JSON.stringify(c));
  renders++;
  bytes += svg.length;
}

// every hairstyle × both genders (beard cycles too)
for (const h of HAIRSTYLES) {
  check({ ...DEFAULT_CHARACTER, gender: "female", hairstyle: h.id });
  check({ ...DEFAULT_CHARACTER, gender: "male", hairstyle: h.id });
}
// every beard on male
for (const b of BEARD_STYLES) {
  check({ ...DEFAULT_CHARACTER, gender: "male", beardStyle: b.id });
}
// every skin tone, build, hair color, glasses, height extremes
for (const t of SKIN_TONES) check({ ...DEFAULT_CHARACTER, skinTone: t.id });
for (const b of BUILDS) check({ ...DEFAULT_CHARACTER, build: b.id });
for (const hc of HAIR_COLORS) check({ ...DEFAULT_CHARACTER, hairColor: hc.hex });
check({ ...DEFAULT_CHARACTER, glasses: true });
check({ ...DEFAULT_CHARACTER, heightCm: 140 });
check({ ...DEFAULT_CHARACTER, heightCm: 205, weightKg: 120 });
check({ ...DEFAULT_CHARACTER, weightKg: 40 });

// full outfit permutations: each seed-ish garment subtype
const garmentNames: Array<[string, Category]> = [
  ["Hoodie", "tops"], ["Cable Knit Sweater", "tops"], ["Overshirt", "tops"],
  ["Tank Top", "tops"], ["Crop Tee", "tops"], ["Oxford Shirt", "tops"],
  ["Polo T-shirt", "tops"], ["Henley Longsleeve", "tops"],
  ["Chino Shorts", "bottoms"], ["Pleated Skirt", "bottoms"], ["Maxi Skirt", "bottoms"],
  ["Mini Skirt", "bottoms"], ["Selvedge Jeans", "bottoms"], ["Cargo Pants", "bottoms"],
  ["Leggings", "bottoms"], ["Wool Trousers", "bottoms"],
  ["Heels", "shoes"], ["Leather Sandals", "shoes"], ["Loafer flats", "shoes"],
  ["Runner Sneakers", "shoes"], ["Derby Boots", "shoes"],
  ["Puffer Jacket", "outerwear"], ["Blazer", "outerwear"], ["Denim Jacket", "outerwear"],
  ["Beanie Hat", "accessories"], ["Leather Tote Bag", "accessories"], ["Watch", "accessories"],
  ["Leather Belt", "accessories"], ["Silver Necklace", "accessories"],
  ["Slip Dress", "dresses"], ["Maxi Dress", "dresses"], ["Mini Dress", "dresses"],
  ["Shirt Dress", "dresses"],
];
for (const [name, cat] of garmentNames) {
  check({ ...DEFAULT_CHARACTER }, [fakeItem(name, cat, "#7a5a44")]);
}
// full outfit on the figure
check({ ...DEFAULT_CHARACTER, gender: "female", hairstyle: "long" }, outfit);
check({ ...DEFAULT_CHARACTER, gender: "male", beardStyle: "full", glasses: true }, outfit);

console.log(`OK — ${renders} avatar renders, ${Math.round(bytes / 1024)} KB of SVG, no crashes.`);
