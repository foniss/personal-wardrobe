import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tryOnResults } from "@/db/schema";
import { serializeResult } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Poll target for an in-flight generation. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const [row] = await db
    .select()
    .from(tryOnResults)
    .where(eq(tryOnResults.id, id))
    .limit(1);
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ result: serializeResult(row) });
}
