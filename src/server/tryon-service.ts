// ------------------------------------------------------------------
// TryOnService — orchestration between the wardrobe, the user's
// reference model and whichever try-on provider is configured.
//
//   matcher → item ids → [this service] → provider → stored image
//
// Responsibilities: resolve real garment images, cache by
// (model + exact garment set + view), run generation as a background
// job, and persist results. It has NO opinion on whether an outfit
// is good — that stays in src/lib/matcher.ts.
// ------------------------------------------------------------------

import { createHash } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { items, tryOnResults, userModels } from "@/db/schema";
import { activeProvider } from "@/lib/tryon/registry";
import {
  roleForCategory,
  type GarmentInput,
  type TryOnView,
} from "@/lib/tryon/types";
import {
  privateAssetToDataUri,
  storePrivateImage,
  wardrobeImageToDataUri,
} from "./private-store";

/**
 * Fingerprint of the provider *and* the generation settings that affect
 * the output, so changing steps/guidance/resolution invalidates the
 * cache instead of silently reusing an old render.
 */
export function providerCacheKey(providerId: string): string {
  if (providerId !== "catvton") return providerId;
  const settings = [
    process.env.CATVTON_STEPS ?? "50",
    process.env.CATVTON_GUIDANCE ?? "2.5",
    process.env.CATVTON_WIDTH ?? "768",
    process.env.CATVTON_HEIGHT ?? "1024",
    process.env.CATVTON_BASE_MODEL ?? "default",
  ].join(":");
  return `catvton@1.0/${settings}`;
}

export function comboHash(
  modelId: string,
  itemIds: string[],
  view: string,
  providerId: string,
): string {
  return createHash("sha256")
    .update(
      [
        modelId,
        providerCacheKey(providerId),
        view,
        [...itemIds].sort().join(","),
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 40);
}

export async function getDefaultModel() {
  const [row] = await db
    .select()
    .from(userModels)
    .orderBy(desc(userModels.updatedAt))
    .limit(1);
  return row ?? null;
}

export interface StartResult {
  status: "cached" | "started" | "unavailable";
  resultId?: string;
  reason?: string;
  setup?: string[];
}

/**
 * Returns an existing generation for this exact combination, or
 * starts a new background job. Never blocks the caller on the
 * provider round-trip.
 */
export async function startTryOn(opts: {
  modelId: string;
  itemIds: string[];
  view: TryOnView;
  force?: boolean;
}): Promise<StartResult> {
  const provider = activeProvider();
  if (!provider) {
    return {
      status: "unavailable",
      reason: "No virtual try-on provider is configured.",
    };
  }

  // Pre-flight for local providers: don't queue work (or create a job
  // row) when the on-device service isn't actually able to run.
  if (typeof provider.health === "function") {
    const health = (await provider.health()) as {
      ready?: boolean;
      reachable?: boolean;
      serviceUrl?: string;
      reasons?: string[];
    };
    if (!health?.ready) {
      return {
        status: "unavailable",
        reason: health?.reachable
          ? health.reasons?.[0] ??
            "The local try-on model is not installed yet."
          : `Local virtual try-on is not running at ${health?.serviceUrl ?? "the configured URL"}.`,
        setup: provider.setupInstructions(),
      };
    }
  }

  const hash = comboHash(opts.modelId, opts.itemIds, opts.view, provider.id);

  if (!opts.force) {
    const [existing] = await db
      .select()
      .from(tryOnResults)
      .where(eq(tryOnResults.comboHash, hash))
      .orderBy(desc(tryOnResults.createdAt))
      .limit(1);
    // reuse anything that succeeded or is still in flight
    if (existing && existing.status !== "failed") {
      return { status: "cached", resultId: existing.id };
    }
  }

  const [job] = await db
    .insert(tryOnResults)
    .values({
      modelId: opts.modelId,
      itemIds: opts.itemIds,
      comboHash: hash,
      view: opts.view,
      status: "pending",
      provider: provider.id,
    })
    .returning();

  // fire-and-forget; the client polls GET /api/try-on/[id]
  void runJob(job.id).catch(async (err) => {
    await db
      .update(tryOnResults)
      .set({
        status: "failed",
        error: err instanceof Error ? err.message : "unknown error",
        finishedAt: new Date(),
      })
      .where(eq(tryOnResults.id, job.id));
  });

  return { status: "started", resultId: job.id };
}

/** Executes one generation job end-to-end. */
export async function runJob(resultId: string): Promise<void> {
  const [job] = await db
    .select()
    .from(tryOnResults)
    .where(eq(tryOnResults.id, resultId))
    .limit(1);
  if (!job || job.status === "done") return;

  const provider = activeProvider();
  if (!provider) {
    await fail(resultId, "No try-on provider configured.");
    return;
  }

  await db
    .update(tryOnResults)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(tryOnResults.id, resultId));

  // 1. the reference person
  const [model] = await db
    .select()
    .from(userModels)
    .where(eq(userModels.id, job.modelId))
    .limit(1);
  if (!model?.referenceImageId) {
    await fail(resultId, "This model has no reference image yet.");
    return;
  }
  const personUri = await privateAssetToDataUri(model.referenceImageId);
  if (!personUri) {
    await fail(resultId, "The reference image could not be read.");
    return;
  }

  // 2. the user's ACTUAL wardrobe photos
  const rows = job.itemIds.length
    ? await db.select().from(items).where(inArray(items.id, job.itemIds))
    : [];
  const garments: GarmentInput[] = [];
  for (const id of job.itemIds) {
    const row = rows.find((r) => r.id === id);
    if (!row) continue;
    const uri = await wardrobeImageToDataUri(row.imagePath);
    if (!uri) continue;
    garments.push({
      itemId: row.id,
      role: roleForCategory(row.category),
      imageDataUri: uri,
      name: row.name,
      colorName: row.colorName,
    });
  }
  if (garments.length === 0) {
    await fail(resultId, "None of the outfit's clothing images could be loaded.");
    return;
  }

  // 3. generate
  const outcome = await provider.tryOn({
    personImageDataUri: personUri,
    garments,
    view: job.view as TryOnView,
  });

  if (!outcome.ok) {
    await fail(resultId, outcome.message, outcome.code);
    return;
  }

  const asset = await storePrivateImage(outcome.image, "tryon", {
    maxWidth: 1024,
    maxHeight: 1536,
  });

  await db
    .update(tryOnResults)
    .set({
      status: "done",
      imageId: asset.id,
      provider: outcome.provider,
      unsupported: outcome.unsupported,
      finishedAt: new Date(),
      error: null,
    })
    .where(eq(tryOnResults.id, resultId));
}

async function fail(id: string, message: string, code?: string): Promise<void> {
  await db
    .update(tryOnResults)
    .set({
      status: "failed",
      error: code ? `${code}: ${message}` : message,
      finishedAt: new Date(),
    })
    .where(eq(tryOnResults.id, id));
}

/** Look up a completed generation for a combination, if one exists. */
export async function findCached(
  modelId: string,
  itemIds: string[],
  view: TryOnView,
) {
  const provider = activeProvider();
  if (!provider) return null;
  const hash = comboHash(modelId, itemIds, view, provider.id);
  const [row] = await db
    .select()
    .from(tryOnResults)
    .where(and(eq(tryOnResults.comboHash, hash), eq(tryOnResults.status, "done")))
    .orderBy(desc(tryOnResults.createdAt))
    .limit(1);
  return row ?? null;
}
