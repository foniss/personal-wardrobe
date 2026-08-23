import { NextResponse } from "next/server";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { savedOutfits, tryOnResults } from "@/db/schema";
import type { SavedOutfit } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function serialize(
  row: typeof savedOutfits.$inferSelect,
  imageId?: string | null,
): SavedOutfit {
  return {
    id: row.id,
    name: row.name,
    occasion: row.occasion,
    anchorId: row.anchorId,
    itemIds: row.itemIds,
    score: row.score,
    headline: row.headline,
    tryOnResultId: row.tryOnResultId,
    // reference the stored generation — never a duplicate copy
    tryOnImageUrl: imageId ? `/api/media/${imageId}` : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Resolves try-on image ids for a batch of saved outfits. */
async function imageIdsFor(rows: Array<typeof savedOutfits.$inferSelect>) {
  const ids = rows
    .map((r) => r.tryOnResultId)
    .filter((x): x is string => Boolean(x));
  if (ids.length === 0) return new Map<string, string | null>();
  const results = await db
    .select({ id: tryOnResults.id, imageId: tryOnResults.imageId })
    .from(tryOnResults)
    .where(inArray(tryOnResults.id, ids));
  return new Map(results.map((r) => [r.id, r.imageId]));
}

export async function GET() {
  const rows = await db
    .select()
    .from(savedOutfits)
    .orderBy(desc(savedOutfits.createdAt));
  const images = await imageIdsFor(rows);
  return NextResponse.json({
    outfits: rows.map((r) =>
      serialize(r, r.tryOnResultId ? images.get(r.tryOnResultId) : null),
    ),
  });
}

export async function POST(req: Request) {
  let body: {
    name?: string;
    occasion?: string | null;
    anchorId?: string | null;
    itemIds?: string[];
    score?: number;
    headline?: string | null;
    tryOnResultId?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const itemIds = Array.isArray(body.itemIds)
    ? body.itemIds.map(String).slice(0, 10)
    : [];
  if (itemIds.length === 0) {
    return NextResponse.json(
      { error: "A fit needs at least one piece." },
      { status: 400 },
    );
  }

  // only link a try-on result that actually exists
  let tryOnResultId: string | null = null;
  let imageId: string | null = null;
  if (typeof body.tryOnResultId === "string" && body.tryOnResultId) {
    const [row] = await db
      .select({ id: tryOnResults.id, imageId: tryOnResults.imageId })
      .from(tryOnResults)
      .where(eq(tryOnResults.id, body.tryOnResultId))
      .limit(1);
    if (row) {
      tryOnResultId = row.id;
      imageId = row.imageId;
    }
  }

  const [row] = await db
    .insert(savedOutfits)
    .values({
      name: (body.name ?? "").trim() || "Untitled fit",
      occasion: body.occasion ?? null,
      anchorId: body.anchorId ?? null,
      itemIds,
      score: Math.max(0, Math.min(100, Math.round(body.score ?? 0))),
      headline: body.headline ?? null,
      tryOnResultId,
    })
    .returning();

  return NextResponse.json({ outfit: serialize(row, imageId) }, { status: 201 });
}
