import { NextResponse } from "next/server";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { items, tryOnResults, userModels } from "@/db/schema";
import { providerDiagnostics } from "@/lib/tryon/registry";
import { TRY_ON_VIEWS, type TryOnView } from "@/lib/tryon/types";
import { findCached, startTryOn } from "@/server/tryon-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ITEMS = 8;

export function serializeResult(row: typeof tryOnResults.$inferSelect) {
  return {
    id: row.id,
    status: row.status,
    view: row.view,
    itemIds: row.itemIds,
    imageUrl: row.imageId ? `/api/media/${row.imageId}` : null,
    provider: row.provider,
    error: row.error,
    unsupported: row.unsupported ?? [],
    createdAt: row.createdAt.toISOString(),
  };
}

/** Look up an existing generation without spending anything. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const itemIds = (url.searchParams.get("itemIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const view = (url.searchParams.get("view") ?? "front") as TryOnView;

  const [model] = await db
    .select()
    .from(userModels)
    .orderBy(desc(userModels.updatedAt))
    .limit(1);

  if (!model || itemIds.length === 0) {
    return NextResponse.json({ result: null, provider: providerDiagnostics() });
  }

  const cached = await findCached(model.id, itemIds, view);
  return NextResponse.json({
    result: cached ? serializeResult(cached) : null,
    provider: providerDiagnostics(),
  });
}

/**
 * Starts (or reuses) a generation. Returns immediately with a job id;
 * the client polls GET /api/try-on/[id]. Generation only ever happens
 * because the user explicitly asked for this outfit.
 */
export async function POST(req: Request) {
  let body: {
    itemIds?: unknown;
    view?: unknown;
    force?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  // ---- validation
  if (!Array.isArray(body.itemIds) || body.itemIds.length === 0) {
    return NextResponse.json(
      { error: "itemIds must be a non-empty array." },
      { status: 400 },
    );
  }
  const itemIds = [...new Set(body.itemIds.map(String))].slice(0, MAX_ITEMS);
  if (!itemIds.every((id) => /^[0-9a-f-]{36}$/i.test(id))) {
    return NextResponse.json({ error: "Malformed item id." }, { status: 400 });
  }

  const view = (typeof body.view === "string" ? body.view : "front") as TryOnView;
  const viewDef = TRY_ON_VIEWS.find((v) => v.id === view);
  if (!viewDef) {
    return NextResponse.json({ error: "Unknown view." }, { status: 400 });
  }
  if (!viewDef.enabled) {
    return NextResponse.json(
      { error: `The ${viewDef.label} view is not available yet.` },
      { status: 400 },
    );
  }

  const existing = await db
    .select({ id: items.id })
    .from(items)
    .where(inArray(items.id, itemIds));
  if (existing.length !== itemIds.length) {
    return NextResponse.json(
      { error: "One or more wardrobe items no longer exist." },
      { status: 404 },
    );
  }

  const [model] = await db
    .select()
    .from(userModels)
    .orderBy(desc(userModels.updatedAt))
    .limit(1);
  if (!model) {
    return NextResponse.json(
      { error: "Create your model first.", needsModel: true },
      { status: 409 },
    );
  }
  if (!model.referenceImageId) {
    return NextResponse.json(
      {
        error: "Your model has no reference photo yet.",
        needsModel: true,
        provider: providerDiagnostics(),
      },
      { status: 409 },
    );
  }

  const started = await startTryOn({
    modelId: model.id,
    itemIds,
    view,
    force: body.force === true,
  });

  if (started.status === "unavailable") {
    return NextResponse.json(
      {
        error: started.reason,
        provider: providerDiagnostics(),
      },
      { status: 503 },
    );
  }

  const [row] = await db
    .select()
    .from(tryOnResults)
    .where(eq(tryOnResults.id, started.resultId!))
    .limit(1);

  return NextResponse.json(
    { result: serializeResult(row), cached: started.status === "cached" },
    { status: started.status === "cached" ? 200 : 202 },
  );
}
