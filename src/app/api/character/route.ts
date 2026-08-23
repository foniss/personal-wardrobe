import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { character } from "@/db/schema";
import {
  DEFAULT_CHARACTER,
  validateCharacter,
  type CharacterParams,
} from "@/avatar/params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROW_ID = "default";

function serialize(row: typeof character.$inferSelect): CharacterParams {
  return {
    gender: row.gender as CharacterParams["gender"],
    heightCm: row.heightCm,
    weightKg: row.weightKg,
    build: row.build as CharacterParams["build"],
    skinTone: row.skinTone,
    hairstyle: row.hairstyle,
    hairColor: row.hairColor,
    beardStyle: row.beardStyle,
    glasses: row.glasses,
  };
}

export async function GET() {
  const [row] = await db
    .select()
    .from(character)
    .where(eq(character.id, ROW_ID))
    .limit(1);

  if (!row) {
    return NextResponse.json({
      character: DEFAULT_CHARACTER,
      configured: false,
    });
  }
  return NextResponse.json({ character: serialize(row), configured: true });
}

export async function PUT(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  // partial payloads merge with the saved character (or defaults)
  const [existingRow] = await db
    .select()
    .from(character)
    .where(eq(character.id, ROW_ID))
    .limit(1);

  const merged = {
    ...(existingRow ? serialize(existingRow) : DEFAULT_CHARACTER),
    ...(typeof body === "object" && body !== null ? body : {}),
  };

  const result = validateCharacter(merged);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  const value = result.value;

  const existing = existingRow ? { id: existingRow.id } : undefined;

  const values = {
    id: ROW_ID,
    gender: value.gender,
    heightCm: value.heightCm,
    weightKg: value.weightKg,
    build: value.build,
    skinTone: value.skinTone,
    hairstyle: value.hairstyle,
    hairColor: value.hairColor,
    beardStyle: value.beardStyle,
    glasses: value.glasses,
    updatedAt: new Date(),
  };

  if (existing) {
    await db.update(character).set(values).where(eq(character.id, ROW_ID));
  } else {
    await db.insert(character).values(values);
  }

  return NextResponse.json({ character: value, configured: true });
}
