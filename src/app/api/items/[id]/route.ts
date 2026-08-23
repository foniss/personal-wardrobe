import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { items } from "@/db/schema";
import { removeUpload } from "@/server/images";
import { CATEGORIES, STYLE_TAGS, type Category } from "@/lib/types";
import { serializeItem } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const [row] = await db.select().from(items).where(eq(items.id, id)).limit(1);
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ item: serializeItem(row) });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const update: Partial<typeof items.$inferInsert> = {};
  if (typeof body.name === "string" && body.name.trim()) {
    update.name = body.name.trim();
  }
  if (
    typeof body.category === "string" &&
    CATEGORIES.includes(body.category as Category)
  ) {
    update.category = body.category;
  }
  if (Array.isArray(body.tags)) {
    update.tags = body.tags
      .map(String)
      .map((t) => t.trim().toLowerCase())
      .filter((t) => STYLE_TAGS.includes(t as (typeof STYLE_TAGS)[number]))
      .slice(0, 8);
  }
  if (body.brand === null || typeof body.brand === "string") {
    update.brand = (body.brand as string | null)?.trim() || null;
  }
  if (typeof body.favorite === "boolean") {
    update.favorite = body.favorite;
  }

  const [row] = await db
    .update(items)
    .set(update)
    .where(eq(items.id, id))
    .returning();
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ item: serializeItem(row) });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const [row] = await db.delete(items).where(eq(items.id, id)).returning();
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });
  await removeUpload(row.imagePath);
  return NextResponse.json({ ok: true });
}
