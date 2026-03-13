import * as dotenv from "dotenv";
dotenv.config();

import { MongoClient } from "mongodb";
import * as fs from "fs";
import * as path from "path";

const DATA_DIR = path.join(process.cwd(), "data");

async function seed() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI not set in .env");
    process.exit(1);
  }

  console.log("Connecting to MongoDB...");
  const client = new MongoClient(uri);
  await client.connect();

  // Parse the database name from the URI — everything between the last '/' and the '?'
  const dbName = uri.split("/").pop()?.split("?")[0] ?? "pikly-store";
  const db = client.db(dbName);
  console.log(`Connected. Using database: ${dbName}`);

  const collections = ["products", "categories", "coupons", "banners", "users", "orders"];

  for (const name of collections) {
    const filePath = path.join(DATA_DIR, `${name}.json`);
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  Skipping ${name}.json — file not found`);
      continue;
    }

    const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as any[];
    const col = db.collection(name);

    let inserted = 0,
      updated = 0;

    for (const doc of data) {
      // Use the 'id' field (our app-level id) as the upsert key, not _id,
      // so re-running the seeder is always safe and never duplicates documents
      const filter = doc.id ? { id: doc.id } : { slug: doc.slug };
      const result = await col.updateOne(
        filter,
        { $set: doc },
        { upsert: true },
      );
      if (result.upsertedCount > 0) inserted++;
      else updated++;
    }

    console.log(
      `✅  ${name}: ${inserted} inserted, ${updated} updated (total ${data.length})`,
    );
  }

  await client.close();
  console.log(
    "\nSeeding complete. You can run this script again at any time — it is safe to re-run.",
  );
}

seed().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});