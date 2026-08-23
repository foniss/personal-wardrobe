import { NextResponse } from "next/server";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/db";
import { items } from "@/db/schema";
import { processUpload } from "@/server/images";
import {
  CATEGORIES,
  type Category,
  type WardrobeItem,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function serializeItem(row: typeof items.$inferSelect): WardrobeItem {
  return {
    id: row.id,
    name: row.name,
    category: row.category as Category,
    colorName: row.colorName,
    colorHex: row.colorHex,
    palette: row.palette,
    imagePath: row.imagePath,
    tags: row.tags,
    brand: row.brand,
    favorite: row.favorite,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const category = url.searchParams.get("category");
  const q = url.searchParams.get("q");

  const where = and(
    category && CATEGORIES.includes(category as Category)
      ? eq(items.category, category)
      : undefined,
    q
      ? or(ilike(items.name, `%${q}%`), ilike(items.brand, `%${q}%`))
      : undefined,
  );

  const rows = await db
    .select()
    .from(items)
    .where(where)
    .orderBy(desc(items.createdAt));

  return NextResponse.json({ items: rows.map(serializeItem) });
}

const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart form data." },
      { status: 400 },
    );
  }

  const file = form.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "An image is required." }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json(
      { error: "Only image files are allowed." },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Image is too large — keep it under 8 MB." },
      { status: 413 },
    );
  }

  const name =
    String(form.get("name") || "").trim() ||
    file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
  const category = String(form.get("category") || "tops");
  if (!CATEGORIES.includes(category as Category)) {
    return NextResponse.json({ error: "Unknown category." }, { status: 400 });
  }
  const tags = form
    .getAll("tags")
    .flatMap((v) => String(v).split(","))
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 8);
  const brand = String(form.get("brand") || "").trim() || null;

  const id = crypto.randomUUID();
  let processed;
  try {
    processed = await processUpload(Buffer.from(await file.arrayBuffer()), id);
  } catch (err) {
    console.error("image processing failed", err);
    return NextResponse.json(
      { error: "Could not read that image — try another file." },
      { status: 422 },
    );
  }

  const [row] = await db
    .insert(items)
    .values({
      name,
      category,
      brand,
      colorName: processed.colorName,
      colorHex: processed.dominant,
      palette: processed.palette,
      imagePath: processed.publicPath,
      tags,
    })
    .returning();

  return NextResponse.json({ item: serializeItem(row) }, { status: 201 });
}
