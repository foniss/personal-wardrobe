import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { userModels } from "@/db/schema";
import {
  deletePrivateAsset,
  storePrivateImage,
} from "@/server/private-store";
import { activeProvider, providerDiagnostics } from "@/lib/tryon/registry";
import { buildModelPrompt, seedForModel } from "@/lib/tryon/prompt";
import { validateCharacter, type CharacterParams } from "@/avatar/params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

function serialize(row: typeof userModels.$inferSelect) {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    imageUrl: row.referenceImageId ? `/api/media/${row.referenceImageId}` : null,
    params: row.params,
    provider: row.provider,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function GET() {
  const [row] = await db
    .select()
    .from(userModels)
    .orderBy(desc(userModels.updatedAt))
    .limit(1);

  return NextResponse.json({
    model: row ? serialize(row) : null,
    provider: providerDiagnostics(),
  });
}

/**
 * Two ways to create the reference person:
 *   multipart/form-data  → Option A, upload your own full-body photo
 *   application/json     → Option B, generate a realistic virtual model
 */
export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";

  // ---------------------------------------------------- Option A: upload
  if (contentType.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json(
        { error: "Expected multipart form data." },
        { status: 400 },
      );
    }
    const file = form.get("photo");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "A full-body photo is required." },
        { status: 400 },
      );
    }
    if (!ALLOWED.includes(file.type)) {
      return NextResponse.json(
        { error: "Use a JPG, PNG or WEBP photo." },
        { status: 415 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "Photo is too large — keep it under 12 MB." },
        { status: 413 },
      );
    }

    let asset;
    try {
      asset = await storePrivateImage(
        Buffer.from(await file.arrayBuffer()),
        "reference",
      );
    } catch {
      return NextResponse.json(
        { error: "That image could not be processed — try another photo." },
        { status: 422 },
      );
    }

    const row = await replaceModel({
      type: "upload",
      status: "ready",
      referenceImageId: asset.id,
      params: null,
      provider: null,
      error: null,
    });
    return NextResponse.json({ model: serialize(row) }, { status: 201 });
  }

  // ------------------------------------------- Option B: virtual model
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = validateCharacter(
    (body as { params?: unknown })?.params ?? body,
  );
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const params: CharacterParams = parsed.value;

  const provider = activeProvider();
  if (!provider || !provider.supportsModelGeneration) {
    // Persist the configuration so nothing the user typed is lost, but
    // be explicit that no image exists yet. No fake image is produced.
    const row = await replaceModel({
      type: "virtual",
      status: "failed",
      referenceImageId: null,
      params: params as unknown as Record<string, unknown>,
      provider: provider?.id ?? null,
      error: "not_configured",
    });
    return NextResponse.json(
      {
        model: serialize(row),
        error:
          "No image provider is configured, so a realistic model photo cannot be generated.",
        provider: providerDiagnostics(),
      },
      { status: 503 },
    );
  }

  const outcome = await provider.generateModel({
    prompt: buildModelPrompt(params),
    seed: seedForModel(params),
  });

  if (!outcome.ok) {
    const row = await replaceModel({
      type: "virtual",
      status: "failed",
      referenceImageId: null,
      params: params as unknown as Record<string, unknown>,
      provider: outcome.provider,
      error: outcome.message,
    });
    return NextResponse.json(
      { model: serialize(row), error: outcome.message, provider: providerDiagnostics() },
      { status: outcome.code === "not_configured" ? 503 : 502 },
    );
  }

  const asset = await storePrivateImage(outcome.image, "reference");
  const row = await replaceModel({
    type: "virtual",
    status: "ready",
    referenceImageId: asset.id,
    params: params as unknown as Record<string, unknown>,
    provider: outcome.provider,
    error: null,
  });
  return NextResponse.json({ model: serialize(row) }, { status: 201 });
}

export async function DELETE() {
  const rows = await db.select().from(userModels);
  for (const row of rows) {
    if (row.referenceImageId) await deletePrivateAsset(row.referenceImageId);
    await db.delete(userModels).where(eq(userModels.id, row.id));
  }
  return NextResponse.json({ ok: true });
}

/** One reference model at a time (single-user app). */
async function replaceModel(values: {
  type: string;
  status: string;
  referenceImageId: string | null;
  params: Record<string, unknown> | null;
  provider: string | null;
  error: string | null;
}) {
  const existing = await db.select().from(userModels);
  for (const row of existing) {
    if (row.referenceImageId) await deletePrivateAsset(row.referenceImageId);
    await db.delete(userModels).where(eq(userModels.id, row.id));
  }
  const [row] = await db
    .insert(userModels)
    .values({ ...values, isDefault: true, updatedAt: new Date() })
    .returning();
  return row;
}
