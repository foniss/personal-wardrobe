import { NextResponse } from "next/server";
import { readPrivateAsset } from "@/server/private-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serves private assets (reference photos, generated try-on images).
 * Files live outside /public and are only reachable through this
 * DB-gated route, so they are never guessable from the filesystem.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const asset = await readPrivateAsset(id);
  if (!asset) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(asset.buffer), {
    headers: {
      "Content-Type": asset.mimeType,
      // private user data — never cache in shared caches
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
