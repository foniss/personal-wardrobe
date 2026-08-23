export const CATEGORIES = [
  "tops",
  "bottoms",
  "shoes",
  "outerwear",
  "accessories",
  "dresses",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  tops: "Tops",
  bottoms: "Bottoms",
  shoes: "Shoes",
  outerwear: "Layers",
  accessories: "Extras",
  dresses: "Dresses",
};

export const CATEGORY_SINGLE: Record<Category, string> = {
  tops: "Top",
  bottoms: "Bottom",
  shoes: "Shoes",
  outerwear: "Layer",
  accessories: "Extra",
  dresses: "Dress",
};

export const STYLE_TAGS = [
  "casual",
  "minimal",
  "streetwear",
  "formal",
  "business",
  "sporty",
  "cozy",
  "vintage",
  "edgy",
  "preppy",
  "bohemian",
  "y2k",
] as const;

export type StyleTag = (typeof STYLE_TAGS)[number];

export const OCCASIONS = [
  { id: "everyday", label: "Everyday", tags: ["casual", "minimal"] },
  { id: "office", label: "Office", tags: ["business", "formal", "minimal"] },
  { id: "date", label: "Date night", tags: ["edgy", "minimal", "vintage"] },
  { id: "party", label: "Party", tags: ["streetwear", "edgy", "y2k"] },
  { id: "active", label: "Active", tags: ["sporty", "casual"] },
  { id: "formal", label: "Formal", tags: ["formal", "business"] },
] as const;

export type OccasionId = (typeof OCCASIONS)[number]["id"];

export interface WardrobeItem {
  id: string;
  name: string;
  category: Category;
  colorName: string;
  colorHex: string;
  palette: string[];
  imagePath: string;
  tags: string[];
  brand: string | null;
  favorite: boolean;
  createdAt: string;
}

export interface FitSlot {
  slot: Category;
  required: boolean;
  item: WardrobeItem | null;
  harmony: number | null;
}

export interface OutfitPick {
  id: string;
  slots: FitSlot[];
  score: number;
  breakdown: { color: number; style: number; balance: number };
  headline: string;
  notes: string[];
}

export interface MatchResponse {
  anchor: WardrobeItem;
  outfits: OutfitPick[];
  missing: Category[];
}

export interface SavedOutfit {
  id: string;
  name: string;
  occasion: string | null;
  anchorId: string | null;
  itemIds: string[];
  score: number;
  headline: string | null;
  tryOnResultId: string | null;
  tryOnImageUrl: string | null;
  createdAt: string;
}

export function titleCase(s: string): string {
  return s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1));
}
