/**
 * One-time migration: drop the old unique index on HeroConfig's
 * {pageType, headerId}. It blocked storing more than one hero config per
 * page, which is now required to support per-zone hero banner variants.
 * Non-unique replacement indexes are created explicitly so this migration
 * is complete even when Mongoose autoIndex is disabled in production.
 * Run: node scripts/migrate-hero-config-zone-index.js
 */
import dotenv from "dotenv";
import connectDB from "../app/dbConfig/dbConfig.js";
import HeroConfig from "../app/models/heroConfig.js";

dotenv.config();

async function run() {
  await connectDB();
  const indexes = await HeroConfig.collection.indexes();
  const legacyUnique = indexes.find(
    (idx) =>
      idx.unique === true &&
      Object.keys(idx.key).length === 2 &&
      idx.key.pageType === 1 &&
      idx.key.headerId === 1,
  );

  if (legacyUnique) {
    await HeroConfig.collection.dropIndex(legacyUnique.name);
    console.log(`[migrate-hero-config-zone-index] Dropped legacy unique index "${legacyUnique.name}"`);
  } else {
    console.log("[migrate-hero-config-zone-index] No legacy unique index found.");
  }

  await HeroConfig.collection.createIndex(
    { pageType: 1, headerId: 1 },
    { name: "pageType_1_headerId_1" },
  );
  await HeroConfig.collection.createIndex(
    { pageType: 1, headerId: 1, zoneIds: 1 },
    { name: "pageType_1_headerId_1_zoneIds_1" },
  );
  console.log("[migrate-hero-config-zone-index] Non-unique hero variant indexes are ready.");
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
