/**
 * seed-mongodb.ts
 *
 * Seeds MongoDB with all data files from /data directory.
 * Safe to re-run at any time — uses upsert so no duplicates.
 *
 * After seeding categories + products it also:
 *  1. Recalculates productCount on each category
 *  2. Syncs products → Algolia (if credentials present)
 *
 * Run:
 *   npx ts-node scripts/seed-mongodb.ts
 */

import * as dotenv from 'dotenv'
dotenv.config()

import { MongoClient } from 'mongodb'
import * as fs from 'fs'
import * as path from 'path'

const DATA_DIR    = path.join(process.cwd(), 'data')
const MONGODB_URI = process.env.MONGODB_URI!

if (!MONGODB_URI) {
  console.error('❌  MONGODB_URI not set in .env')
  process.exit(1)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadJson<T>(filename: string): T[] {
  const fp = path.join(DATA_DIR, filename)
  if (!fs.existsSync(fp)) {
    console.log(`⚠️   ${filename} not found — skipping`)
    return []
  }
  const raw = fs.readFileSync(fp, 'utf-8')
  return JSON.parse(raw) as T[]
}

async function upsertMany(
  col: any,
  docs: any[],
  key: string = 'id',
): Promise<{ inserted: number; updated: number }> {
  let inserted = 0, updated = 0
  for (const doc of docs) {
    const filter  = doc[key] ? { [key]: doc[key] } : { slug: doc.slug }
    const result  = await col.updateOne(filter, { $set: doc }, { upsert: true })
    if (result.upsertedCount > 0) inserted++
    else updated++
  }
  return { inserted, updated }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function seed() {
  console.log('🔌  Connecting to MongoDB…')
  const client = new MongoClient(MONGODB_URI)
  await client.connect()

  const dbName = MONGODB_URI.split('/').pop()?.split('?')[0] ?? 'pikly-store'
  const db     = client.db(dbName)
  console.log(`✅  Connected — database: "${dbName}"\n`)

  // ── 1. Categories ────────────────────────────────────────────────────────────
  const categories = loadJson<any>('categories.json')
  if (categories.length > 0) {
    const col = db.collection('categories')
    const { inserted, updated } = await upsertMany(col, categories)
    console.log(`✅  categories:    ${inserted} inserted, ${updated} updated  (${categories.length} total)`)

    // Ensure indexes
    await col.createIndex({ slug: 1 },                     { unique: true, background: true })
    await col.createIndex({ parentId: 1 },                 { background: true })
    await col.createIndex({ isActive: 1, isFeatured: 1 },  { background: true })
    await col.createIndex({ level: 1, isActive: 1 },       { background: true })
    await col.createIndex({ nodeId: 1 },                   { background: true, sparse: true })
  }

  // ── 2. Products ───────────────────────────────────────────────────────────────
  const products = loadJson<any>('products.json')
  if (products.length > 0) {
    const col = db.collection('products')
    const { inserted, updated } = await upsertMany(col, products)
    console.log(`✅  products:      ${inserted} inserted, ${updated} updated  (${products.length} total)`)

    // Ensure all critical indexes exist
    await col.createIndex({ id: 1 },                            { unique: true, background: true })
    await col.createIndex({ slug: 1 },                          { unique: true, background: true })
    await col.createIndex({ asin: 1 },                          { background: true, sparse: true })
    await col.createIndex({ category: 1, isActive: 1 },         { background: true })
    await col.createIndex({ subcategory: 1, isActive: 1 },      { background: true })
    await col.createIndex({ 'categoryInfo.id': 1, isActive: 1 },{ background: true })
    await col.createIndex({ price: 1, isActive: 1 },            { background: true })
    await col.createIndex({ avgRating: -1, isActive: 1 },       { background: true })
    await col.createIndex({ soldCount: -1, isActive: 1 },       { background: true })
    await col.createIndex({ discountPercent: -1, isActive: 1 }, { background: true })
    await col.createIndex({ createdAtMs: -1, isActive: 1 },     { background: true })
    await col.createIndex({ featured: 1, isActive: 1 },         { background: true })
    await col.createIndex({ bestSeller: 1, isActive: 1 },       { background: true })
    await col.createIndex({ newArrival: 1, isActive: 1 },       { background: true })
    await col.createIndex({ trending: 1, isActive: 1 },         { background: true })
    await col.createIndex({ onSale: 1, isActive: 1 },           { background: true })
    await col.createIndex({ isPrime: 1, isActive: 1 },          { background: true })
    await col.createIndex({ inStock: 1, isActive: 1 },          { background: true })
    await col.createIndex({ attrValues: 1 },                    { background: true })
    await col.createIndex({ colors: 1 },                        { background: true })
    await col.createIndex({ sizes: 1 },                         { background: true })
    await col.createIndex({ 'reviews.userId': 1 },              { background: true })
    await col.createIndex(
      { title: 'text', brand: 'text', description: 'text', tags: 'text' },
      { background: true }
    )
  }

  // ── 3. Recalculate productCount on each category ──────────────────────────────
  if (products.length > 0 && categories.length > 0) {
    const productCol  = db.collection('products')
    const categoryCol = db.collection('categories')

    const countBySlug: Record<string, number> = {}

    // Count active products per category slug
    const cursor = productCol.find({ isActive: true }, { projection: { category: 1, subcategory: 1, 'categoryInfo.breadcrumbs': 1 } })
    for await (const doc of cursor) {
      // Count in leaf category
      if (doc.category)    countBySlug[doc.category]    = (countBySlug[doc.category]    ?? 0) + 1
      if (doc.subcategory) countBySlug[doc.subcategory] = (countBySlug[doc.subcategory] ?? 0) + 1
      // Count in every ancestor too (so parent categories show correct totals)
      for (const crumb of (doc.categoryInfo?.breadcrumbs ?? [])) {
        if (crumb.slug) countBySlug[crumb.slug] = (countBySlug[crumb.slug] ?? 0) + 1
      }
    }

    // Write productCounts back
    let catUpdated = 0
    for (const cat of categories) {
      const count = countBySlug[cat.slug] ?? 0
      await categoryCol.updateOne({ id: cat.id }, { $set: { productCount: count } })
      catUpdated++
    }
    console.log(`✅  productCounts: updated ${catUpdated} categories`)
  }

  // ── 4. Other collections ──────────────────────────────────────────────────────
  const others: Array<{ file: string; col: string; key?: string }> = [
    { file: 'banners.json',  col: 'banners' },
    { file: 'coupons.json',  col: 'coupons' },
    { file: 'orders.json',   col: 'orders'  },
    { file: 'users.json',    col: 'users'   },
  ]

  for (const { file, col: colName, key } of others) {
    const docs = loadJson<any>(file)
    if (docs.length === 0) continue
    const col = db.collection(colName)
    const { inserted, updated } = await upsertMany(col, docs, key)
    console.log(`✅  ${colName.padEnd(14)}: ${inserted} inserted, ${updated} updated  (${docs.length} total)`)
  }

  await client.close()

  console.log('\n🎉  Seeding complete!')
  console.log('    Re-run any time — upserts are always safe.')
  console.log('\nNext step: run sync-algolia.ts to push products to Algolia.')
}

seed().catch((err) => {
  console.error('❌  Seed failed:', err.message)
  process.exit(1)
})
