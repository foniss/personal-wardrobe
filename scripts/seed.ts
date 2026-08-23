// Seed the wardrobe with a starter kit of editorial pieces.
// Run: npx tsx scripts/seed.ts   (add --force to append again)
import { config } from "dotenv";
config();

import path from "node:path";

const SEED = [
  {
    file: "overshirt.jpg",
    name: "Ecru Linen Overshirt",
    category: "tops",
    brand: "COS",
    tags: ["minimal", "casual", "business"],
  },
  {
    file: "jeans.jpg",
    name: "Indigo Selvedge Jean",
    category: "bottoms",
    brand: "Levi's",
    tags: ["casual", "streetwear", "vintage"],
  },
  {
    file: "sweater.jpg",
    name: "Rust Cable Knit",
    category: "tops",
    brand: "Arket",
    tags: ["cozy", "casual", "vintage"],
  },
  {
    file: "trench.jpg",
    name: "Sand Trench Coat",
    category: "outerwear",
    brand: "Burberry",
    tags: ["formal", "business", "minimal"],
  },
  {
    file: "sneakers.jpg",
    name: "White Leather Sneaker",
    category: "shoes",
    brand: "Common Projects",
    tags: ["minimal", "casual", "sporty"],
  },
  {
    file: "boots.jpg",
    name: "Black Chelsea Boot",
    category: "shoes",
    brand: "Blundstone",
    tags: ["edgy", "formal", "minimal"],
  },
  {
    file: "scarf.jpg",
    name: "Charcoal Wool Scarf",
    category: "accessories",
    brand: "Acne Studios",
    tags: ["cozy", "minimal"],
  },
  {
    file: "tote.jpg",
    name: "Black Leather Tote",
    category: "accessories",
    brand: "Cuyana",
    tags: ["business", "minimal", "formal"],
  },
] as const;

async function main() {
  const { db } = await import("../src/db");
  const { items } = await import("../src/db/schema");
  const { paletteFromFile } = await import("../src/server/images");

  const force = process.argv.includes("--force");
  const existing = await db.select({ id: items.id }).from(items).limit(1);
  if (existing.length > 0 && !force) {
    console.log(
      "Wardrobe already has pieces — skipping seed. Use --force to reseed.",
    );
    process.exit(0);
  }
  if (force) {
    await db.delete(items);
    console.log("Cleared existing wardrobe for reseed.");
  }

  for (const def of SEED) {
    const abs = path.join(process.cwd(), "public", "seed", def.file);
    const p = await paletteFromFile(abs);
    await db.insert(items).values({
      name: def.name,
      category: def.category,
      brand: def.brand,
      tags: [...def.tags],
      colorName: p.colorName,
      colorHex: p.dominant,
      palette: p.palette,
      imagePath: `/seed/${def.file}`,
    });
    console.log(`seeded ${def.name.padEnd(24)} → ${p.colorName} ${p.dominant}`);
  }
  console.log("Wardrobe seeded.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
