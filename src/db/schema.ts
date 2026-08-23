import { pgTable, uuid, text, boolean, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

export const items = pgTable("items", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  colorName: text("color_name").notNull(),
  colorHex: text("color_hex").notNull(),
  palette: jsonb("palette").$type<string[]>().notNull(),
  imagePath: text("image_path").notNull(),
  tags: jsonb("tags").$type<string[]>().notNull(),
  brand: text("brand"),
  favorite: boolean("favorite").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const savedOutfits = pgTable("saved_outfits", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  occasion: text("occasion"),
  anchorId: uuid("anchor_id"),
  itemIds: jsonb("item_ids").$type<string[]>().notNull(),
  score: integer("score").notNull().default(0),
  headline: text("headline"),
  // optional link to the visualization this fit was saved with
  tryOnResultId: uuid("try_on_result_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------- try-on
// The user's reference person for virtual try-on. Either an uploaded
// photo of themselves ("upload") or a generated realistic model
// ("virtual"). Reference images live in private storage, never in
// /public — they are served through /api/media/[id].
export const userModels = pgTable("user_models", {
  id: uuid("id").defaultRandom().primaryKey(),
  type: text("type").notNull(), // 'upload' | 'virtual'
  status: text("status").notNull().default("ready"), // pending|ready|failed
  referenceImageId: uuid("reference_image_id"), // -> privateAssets.id
  // virtual-model configuration (null for uploads)
  params: jsonb("params").$type<Record<string, unknown> | null>(),
  provider: text("provider"),
  error: text("error"),
  isDefault: boolean("is_default").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Private binary assets (reference photos + generated try-on images).
// Stored on disk outside the web root; rows gate access.
export const privateAssets = pgTable("private_assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  path: text("path").notNull(), // relative to the private store root
  mimeType: text("mime_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  kind: text("kind").notNull(), // 'reference' | 'tryon'
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// One generated visualization. `comboHash` keys the cache on
// model + exact garment set + view, so the same combination is
// never paid for twice.
export const tryOnResults = pgTable("try_on_results", {
  id: uuid("id").defaultRandom().primaryKey(),
  modelId: uuid("model_id").notNull(),
  itemIds: jsonb("item_ids").$type<string[]>().notNull(),
  comboHash: text("combo_hash").notNull(),
  view: text("view").notNull().default("front"),
  status: text("status").notNull().default("pending"), // pending|running|done|failed
  imageId: uuid("image_id"), // -> privateAssets.id
  provider: text("provider"),
  error: text("error"),
  unsupported: jsonb("unsupported").$type<string[]>().default([]),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Single-row user character/profile (single-user app: id is a fixed key).
export const character = pgTable("character", {
  id: text("id").primaryKey().default("default"),
  gender: text("gender").notNull().default("female"),
  heightCm: integer("height_cm").notNull().default(168),
  weightKg: integer("weight_kg"),
  build: text("build").notNull().default("average"),
  skinTone: text("skin_tone").notNull().default("tone-3"),
  hairstyle: text("hair_style").notNull().default("medium"),
  hairColor: text("hair_color").notNull().default("#3a2417"),
  beardStyle: text("beard_style").notNull().default("none"),
  glasses: boolean("glasses").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
