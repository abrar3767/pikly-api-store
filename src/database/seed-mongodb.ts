/**
 * Data Seeder Script
 *
 * This script runs ONCE to import all JSON seed data into MongoDB.
 * It is idempotent — running it multiple times is safe because it uses
 * upsert (update if exists, insert if not) keyed on the `id` field.
 *
 * Run with:
 *   npx ts-node scripts/seed-mongodb.ts
 *
 * Make sure your .env file has MONGODB_URI set before running.
 */

import * as dotenv from "dotenv";
dotenv.config();

import * as mongoose from "mongoose";
import * as fs from "fs";
import * as path from "path";

// ── Helper ─────────────────────────────────────────────────────────────────
function loadJson(file: string): any[] {
  const filePath = path.join(process.cwd(), "data", `${file}.json`);
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (e) {
    console.warn(`⚠️  Could not load ${file}.json — skipping`);
    return [];
  }
}

// ── Minimal inline schemas (no decorators needed in a standalone script) ───
const ProductSchema = new mongoose.Schema({ _id: false }, { strict: false });
const CategorySchema = new mongoose.Schema({ _id: false }, { strict: false });
const CouponSchema = new mongoose.Schema({ _id: false }, { strict: false });
const BannerSchema = new mongoose.Schema({ _id: false }, { strict: false });

// ── Main ───────────────────────────────────────────────────────────────────
async function seed() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("❌  MONGODB_URI is not set in .env");
    process.exit(1);
  }

  console.log("🔌  Connecting to MongoDB…");
  await mongoose.connect(uri);
  console.log("✅  Connected\n");

  const db = mongoose.connection.db!;

  // ── Products ─────────────────────────────────────────────────────────────
  const products = loadJson("products");
  if (products.length > 0) {
    const col = db.collection("products");
    let inserted = 0,
      updated = 0;
    for (const p of products) {
      const result = await col.updateOne(
        { id: p.id },
        { $set: p },
        { upsert: true },
      );
      result.upsertedCount > 0 ? inserted++ : updated++;
    }
    console.log(
      `📦  Products   — ${inserted} inserted, ${updated} updated (total: ${products.length})`,
    );
  }

  // ── Categories ───────────────────────────────────────────────────────────
  const categories = loadJson("categories");
  if (categories.length > 0) {
    const col = db.collection("categories");
    let inserted = 0,
      updated = 0;
    for (const c of categories) {
      const result = await col.updateOne(
        { id: c.id },
        { $set: c },
        { upsert: true },
      );
      result.upsertedCount > 0 ? inserted++ : updated++;
    }
    console.log(
      `🗂️   Categories — ${inserted} inserted, ${updated} updated (total: ${categories.length})`,
    );
  }

  // ── Coupons ──────────────────────────────────────────────────────────────
  const coupons = loadJson("coupons");
  if (coupons.length > 0) {
    const col = db.collection("coupons");
    let inserted = 0,
      updated = 0;
    for (const c of coupons) {
      // Fix expired 2025 dates — extend to 2027 (Bug #26 from audit)
      if (c.expiresAt && c.expiresAt.startsWith("2025")) {
        c.expiresAt = c.expiresAt.replace("2025", "2027");
      }
      const result = await col.updateOne(
        { id: c.id },
        { $set: c },
        { upsert: true },
      );
      result.upsertedCount > 0 ? inserted++ : updated++;
    }
    console.log(
      `🎟️   Coupons    — ${inserted} inserted, ${updated} updated (total: ${coupons.length})`,
    );
  }

  // ── Banners ──────────────────────────────────────────────────────────────
  const banners = loadJson("banners");
  if (banners.length > 0) {
    const col = db.collection("banners");
    let inserted = 0,
      updated = 0;
    for (const b of banners) {
      const result = await col.updateOne(
        { id: b.id },
        { $set: b },
        { upsert: true },
      );
      result.upsertedCount > 0 ? inserted++ : updated++;
    }
    console.log(
      `🖼️   Banners    — ${inserted} inserted, ${updated} updated (total: ${banners.length})`,
    );
  }

  await mongoose.disconnect();
  console.log("\n✅  Seeding complete. MongoDB is ready.");
}

seed().catch((err) => {
  console.error("❌  Seeding failed:", err.message);
  process.exit(1);
});
