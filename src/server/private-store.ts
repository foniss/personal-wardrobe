// ------------------------------------------------------------------
// Private asset storage. Reference photos of the user and generated
// try-on images are NOT written to /public — they live under
// .data/private and are only reachable through /api/media/[id],
// which resolves an opaque UUID via the database.
//
// Reuses the same sharp pipeline conventions as src/server/images.ts.
// ------------------------------------------------------------------

import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { privateAssets } from "@/db/schema";

export const PRIVATE_ROOT = path.join(process.cwd(), ".data", "private");

export type AssetKind = "reference" | "tryon";

export interface StoredAsset {
  id: string;
  mimeType: string;
  byteSize: number;
}

async function ensureRoot(): Promise<void> {
  await fs.mkdir(PRIVATE_ROOT, { recursive: true });
}

/**
 * Normalizes an image buffer to a web-friendly portrait JPEG and
 * records it as a private asset. Returns the opaque asset id.
 */
export async function storePrivateImage(
  buffer: Buffer,
  kind: AssetKind,
  opts: { maxWidth?: number; maxHeight?: number } = {},
): Promise<StoredAsset> {
  await ensureRoot();

  const normalized = await sharp(buffer)
    .rotate()
    .resize(opts.maxWidth ?? 1024, opts.maxHeight ?? 1536, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 90 })
    .toBuffer();

  const fileName = `${kind}-${crypto.randomUUID()}.jpg`;
  await fs.writeFile(path.join(PRIVATE_ROOT, fileName), normalized);

  const [row] = await db
    .insert(privateAssets)
    .values({
      path: fileName,
      mimeType: "image/jpeg",
      byteSize: normalized.byteLength,
      kind,
    })
    .returning();

  return { id: row.id, mimeType: row.mimeType, byteSize: row.byteSize };
}

export async function readPrivateAsset(
  id: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const [row] = await db
    .select()
    .from(privateAssets)
    .where(eq(privateAssets.id, id))
    .limit(1);
  if (!row) return null;

  // guard against path traversal from any future writer
  const safe = path.basename(row.path);
  try {
    const buffer = await fs.readFile(path.join(PRIVATE_ROOT, safe));
    return { buffer, mimeType: row.mimeType };
  } catch {
    return null;
  }
}

export async function deletePrivateAsset(id: string): Promise<void> {
  const [row] = await db
    .select()
    .from(privateAssets)
    .where(eq(privateAssets.id, id))
    .limit(1);
  if (!row) return;
  try {
    await fs.unlink(path.join(PRIVATE_ROOT, path.basename(row.path)));
  } catch {
    /* already gone */
  }
  await db.delete(privateAssets).where(eq(privateAssets.id, id));
}

/** Reads a private asset as a data URI (what providers accept as input). */
export async function privateAssetToDataUri(id: string): Promise<string | null> {
  const asset = await readPrivateAsset(id);
  if (!asset) return null;
  return `data:${asset.mimeType};base64,${asset.buffer.toString("base64")}`;
}

/** Reads a wardrobe image (public or seed) as a data URI for provider input. */
export async function wardrobeImageToDataUri(
  imagePath: string,
): Promise<string | null> {
  const safeRel = imagePath.replace(/^\/+/, "");
  if (safeRel.includes("..")) return null;
  const abs = path.join(process.cwd(), "public", safeRel);
  try {
    // Normalize to JPEG so every provider gets a predictable payload.
    const buf = await sharp(abs)
      .rotate()
      .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();
    return `data:image/jpeg;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}
