// Server-only image pipeline: stores uploads and extracts palettes.
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { extractPaletteFromPixels } from "../lib/palette";
import { nearestColorName } from "../lib/colors";

export interface ProcessedUpload {
  publicPath: string;
  dominant: string;
  colorName: string;
  palette: string[];
}

export async function processUpload(
  buffer: Buffer,
  id: string,
): Promise<ProcessedUpload> {
  const destDir = path.join(process.cwd(), "public", "uploads");
  await fs.mkdir(destDir, { recursive: true });
  const fileName = `${id}.webp`;
  const outPath = path.join(destDir, fileName);

  const base = sharp(buffer).rotate();

  const raw = await base
    .clone()
    .resize(96, 96, { fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const extracted = extractPaletteFromPixels(
    raw.data,
    raw.info.width,
    raw.info.height,
  );

  await base
    .clone()
    .resize(1400, 1400, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 84 })
    .toFile(outPath);

  return {
    publicPath: `/uploads/${fileName}`,
    dominant: extracted.dominant,
    colorName: nearestColorName(extracted.dominant),
    palette: extracted.palette,
  };
}

export async function paletteFromFile(absPath: string): Promise<{
  dominant: string;
  colorName: string;
  palette: string[];
}> {
  const raw = await sharp(absPath)
    .rotate()
    .resize(96, 96, { fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const extracted = extractPaletteFromPixels(
    raw.data,
    raw.info.width,
    raw.info.height,
  );
  return {
    dominant: extracted.dominant,
    colorName: nearestColorName(extracted.dominant),
    palette: extracted.palette,
  };
}

export async function removeUpload(publicPath: string): Promise<void> {
  if (!publicPath.startsWith("/uploads/")) return;
  try {
    await fs.unlink(path.join(process.cwd(), "public", publicPath));
  } catch {
    // already gone
  }
}
