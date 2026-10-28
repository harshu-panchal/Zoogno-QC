/**
 * One-time migration: drop the old unique index on HeroConfig's
 * {pageType, headerId}. It blocked storing more than one hero config per
 * page, which is now required to support per-zone hero banner variants.
 * The non-unique replacement index is declared on the schema and gets
 * created automatically on next connect (mongoose autoIndex).
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

  if (!legacyUnique) {
    console.log("[migrate-hero-config-zone-index] No legacy unique index found, nothing to do.");
    process.exit(0);
  }

  await HeroConfig.collection.dropIndex(legacyUnique.name);
  console.log(`[migrate-hero-config-zone-index] Dropped legacy unique index "${legacyUnique.name}"`);
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
