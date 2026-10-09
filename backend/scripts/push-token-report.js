/**
 * Push token report - answers "did the app ever register?" straight from the database.
 *
 *   node scripts/push-token-report.js
 *   node scripts/push-token-report.js --role delivery --platform app --limit 20
 *
 * Read-only: it never writes or deletes anything.
 */
import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const PushToken = (await import("../app/modules/notifications/token.model.js")).default;

function arg(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const roleFilter = arg("role");
const platformFilter = arg("platform");
const limit = Number(arg("limit", "15")) || 15;

const uri = process.env.MONGO_URI;
if (!uri) {
  console.error("MONGO_URI is not set in backend/.env");
  process.exit(1);
}

await mongoose.connect(uri);

const breakdown = await PushToken.aggregate([
  {
    $group: {
      _id: { role: "$role", platform: "$platform", platformDetail: "$platformDetail" },
      total: { $sum: 1 },
      active: { $sum: { $cond: ["$isActive", 1, 0] } },
      newest: { $max: "$lastUsedAt" },
    },
  },
  { $sort: { "_id.role": 1, "_id.platform": 1 } },
]);

console.log("\n=== pushtokens: role x platform ===");
if (!breakdown.length) {
  console.log("(collection is empty - no device has ever registered)");
} else {
  for (const row of breakdown) {
    const { role, platform, platformDetail } = row._id;
    console.log(
      `${String(role).padEnd(9)} ${String(platform).padEnd(4)} ${String(platformDetail || "unknown").padEnd(8)}` +
        ` total=${String(row.total).padEnd(5)} active=${String(row.active).padEnd(5)} newest=${row.newest ? new Date(row.newest).toISOString() : "-"}`,
    );
  }
}

for (const role of ["seller", "delivery"]) {
  const appCount = await PushToken.countDocuments({ role, platform: "app", isActive: true });
  console.log(
    `\n${role}: ${appCount} active app token(s) ` +
      (appCount === 0 ? "<-- the Flutter wrapper is not handing over its FCM token" : "OK"),
  );
}

const query = {};
if (roleFilter) query.role = roleFilter;
if (platformFilter) query.platform = platformFilter;

const recent = await PushToken.find(query)
  .select("role platform platformDetail isActive device lastUsedAt invalidReason token")
  .sort({ lastUsedAt: -1 })
  .limit(limit)
  .lean();

console.log(`\n=== ${recent.length} most recent token(s)${roleFilter ? ` for role=${roleFilter}` : ""} ===`);
for (const item of recent) {
  const token = String(item.token || "");
  console.log(
    [
      item.role,
      item.platform,
      item.platformDetail || "unknown",
      item.isActive ? "active" : `inactive(${item.invalidReason || "?"})`,
      `len=${token.length}`,
      `colon=${token.includes(":")}`,
      `${token.slice(0, 12)}...${token.slice(-6)}`,
      item.lastUsedAt ? new Date(item.lastUsedAt).toISOString() : "-",
      String(item.device || "").slice(0, 60),
    ].join("  "),
  );
}

await mongoose.disconnect();
console.log("");
