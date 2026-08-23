import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { items } from "@/db/schema";
import { buildOutfits } from "@/lib/matcher";
import { serializeItem } from "../items/route";
import type { MatchResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { anchorId?: string; occasion?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (!body.anchorId) {
    return NextResponse.json({ error: "anchorId is required." }, { status: 400 });
  }

  const rows = await db.select().from(items).orderBy(desc(items.createdAt));
  const wardrobe = rows.map(serializeItem);
  const anchor = wardrobe.find((i) => i.id === body.anchorId);
  if (!anchor) {
    return NextResponse.json({ error: "Anchor piece not found." }, { status: 404 });
  }

  const { outfits, missing } = buildOutfits(anchor, wardrobe, {
    occasion: body.occasion ?? null,
    limit: 3,
  });

  const payload: MatchResponse = { anchor, outfits, missing };
  return NextResponse.json(payload);
}
