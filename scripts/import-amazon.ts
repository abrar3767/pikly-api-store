/**
 * import-amazon.ts
 *
 * Reads amazon_products.csv + amazon_categories.csv, transforms every row
 * into the pikly-store Product schema, and upserts into MongoDB Atlas.
 *
 * Usage:
 *   npx ts-node scripts/import-amazon.ts
 *
 * Env vars required (same .env as the app):
 *   MONGODB_URI
 *
 * The script streams the CSV so it never loads the full 1.4M rows into RAM.
 * It upserts in batches of 500 — safe to re-run (idempotent via `id` field).
 */

import * as dotenv from 'dotenv'
dotenv.config()

import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'
import mongoose from 'mongoose'
import slugify from 'slugify'
import { faker } from '@faker-js/faker'
import { getCategoryMeta, pickColors, pickSizes } from './category-attribute-map'

// ── Config ────────────────────────────────────────────────────────────────────

const PRODUCTS_CSV   = 'C:/Users/Waseem Computer Nwl/Downloads/amazon_products.csv'
const CATEGORIES_CSV = 'C:/Users/Waseem Computer Nwl/Downloads/amazon_categories.csv'
const MONGODB_URI    = process.env.MONGODB_URI!
const BATCH_SIZE     = 500
const TARGET_TOTAL   = 50_000   // max products to import

if (!MONGODB_URI) { console.error('Missing MONGODB_URI in .env'); process.exit(1) }

// ── Mongoose schema (loose — matches existing Product schema) ─────────────────

const ProductSchema = new mongoose.Schema({}, { strict: false })
const Product = mongoose.models.Product ?? mongoose.model('Product', ProductSchema, 'products')

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = '', inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { inQuotes = !inQuotes; continue }
    if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue }
    current += ch
  }
  result.push(current.trim())
  return result
}

function makeSlug(title: string, asin: string): string {
  const base = slugify(title.slice(0, 60), { lower: true, strict: true })
  return `${base}-${asin.toLowerCase()}`
}

function extractBrand(title: string): string {
  // Most Amazon titles start with brand name before first comma or space-dash
  const comma = title.indexOf(',')
  const dash  = title.indexOf(' - ')
  const cut   = Math.min(
    comma > 0 ? comma : 999,
    dash  > 0 ? dash  : 999,
    30,
  )
  const candidate = title.slice(0, cut).split(' ')[0]
  return candidate.length > 1 && candidate.length < 25 ? candidate : 'Amazon'
}

function makeDescription(title: string, categoryLabel: string): string {
  return `${title}. ${faker.commerce.productDescription()} Available in multiple variants. Part of our ${categoryLabel} collection.`
}

function makeTags(title: string, category: string, sub: string): string[] {
  const words = title.toLowerCase().split(/\s+/).filter(w => w.length > 3).slice(0, 5)
  return [...new Set([...words, category, sub])]
}

function makeReviews(count: number, avgRating: number): any[] {
  const num = Math.min(faker.number.int({ min: 0, max: 5 }), count > 0 ? 3 : 0)
  return Array.from({ length: num }, () => ({
    id: `rev_${faker.string.alphanumeric(10)}`,
    userId: `user_${faker.string.alphanumeric(8)}`,
    rating: Math.max(1, Math.min(5, Math.round(avgRating + faker.number.float({ min: -1, max: 1 })))),
    title: faker.lorem.sentence({ min: 3, max: 8 }),
    body: faker.lorem.paragraph(),
    verified: faker.datatype.boolean(0.7),
    helpful: faker.number.int({ min: 0, max: 200 }),
    images: [],
    createdAt: faker.date.past({ years: 2 }).toISOString(),
  }))
}

function makeVariants(colors: string[], sizes: string[]): any[] {
  const variants: any[] = []
  const selectedColors = pickColors(colors)
  const selectedSizes  = pickSizes(sizes)

  if (selectedColors.length === 0 && selectedSizes.length === 0) return []

  if (selectedColors.length > 0 && selectedSizes.length === 0) {
    selectedColors.forEach((color, i) => variants.push({
      variantId: `var_${faker.string.alphanumeric(8)}_${i}`,
      color,
      colorHex: faker.color.rgb(),
      size: null,
      image: '',
      stock: faker.number.int({ min: 0, max: 100 }),
      priceDiff: faker.number.float({ min: 0, max: 20, fractionDigits: 2 }),
    }))
  } else if (selectedSizes.length > 0 && selectedColors.length === 0) {
    selectedSizes.forEach((size, i) => variants.push({
      variantId: `var_${faker.string.alphanumeric(8)}_${i}`,
      color: null,
      colorHex: null,
      size,
      image: '',
      stock: faker.number.int({ min: 0, max: 100 }),
      priceDiff: 0,
    }))
  } else {
    selectedColors.forEach((color, ci) => {
      selectedSizes.slice(0, 2).forEach((size, si) => {
        variants.push({
          variantId: `var_${faker.string.alphanumeric(8)}_${ci}_${si}`,
          color,
          colorHex: faker.color.rgb(),
          size,
          image: '',
          stock: faker.number.int({ min: 0, max: 50 }),
          priceDiff: faker.number.float({ min: 0, max: 10, fractionDigits: 2 }),
        })
      })
    })
  }
  return variants
}

function buildRatingDistribution(count: number, avg: number): Record<string, number> {
  if (count === 0) return { '5': 0, '4': 0, '3': 0, '2': 0, '1': 0 }
  const five  = avg >= 4.5 ? Math.floor(count * 0.60) : avg >= 4.0 ? Math.floor(count * 0.40) : Math.floor(count * 0.20)
  const four  = avg >= 4.5 ? Math.floor(count * 0.25) : avg >= 4.0 ? Math.floor(count * 0.30) : Math.floor(count * 0.25)
  const three = avg >= 4.5 ? Math.floor(count * 0.08) : avg >= 4.0 ? Math.floor(count * 0.15) : Math.floor(count * 0.25)
  const two   = avg >= 4.5 ? Math.floor(count * 0.04) : avg >= 4.0 ? Math.floor(count * 0.08) : Math.floor(count * 0.15)
  const one   = count - five - four - three - two
  return { '5': five, '4': four, '3': three, '2': two, '1': Math.max(0, one) }
}

// ── Transform CSV row → Product document ─────────────────────────────────────

function transform(row: Record<string, string>, index: number): any {
  const asin       = row.asin?.trim()
  const title      = row.title?.trim() || 'Untitled Product'
  const imgUrl     = row.imgUrl?.trim() || ''
  const stars      = parseFloat(row.stars) || 0
  const reviews    = parseInt(row.reviews) || 0
  const price      = parseFloat(row.price) || 0
  const listPrice  = parseFloat(row.listPrice) || 0
  const categoryId = row.category_id?.trim() || '0'
  const isBestSeller = row.isBestSeller?.toLowerCase() === 'true'
  const boughtLast = parseInt(row.boughtInLastMonth) || 0

  if (!asin || price <= 0) return null   // skip free/invalid products

  const meta         = getCategoryMeta(categoryId)
  const brand        = extractBrand(title)
  const slug         = makeSlug(title, asin)
  const description  = makeDescription(title, meta.parentLabel)
  const tags         = makeTags(title, meta.parent, meta.sub)
  const attributes   = meta.attributes()
  const variants     = makeVariants(meta.colors, meta.sizes)

  const originalPrice   = listPrice > price ? listPrice : price * faker.number.float({ min: 1.0, max: 1.4, fractionDigits: 2 })
  const discountPercent = originalPrice > price ? Math.round(((originalPrice - price) / originalPrice) * 100) : 0

  const stock   = faker.number.int({ min: 0, max: 500 })
  const sold    = boughtLast > 0 ? boughtLast + faker.number.int({ min: 0, max: boughtLast * 3 }) : faker.number.int({ min: 0, max: 200 })

  const estDaysMin = faker.number.int({ min: 1, max: 5 })
  const estDaysMax = estDaysMin + faker.number.int({ min: 1, max: 5 })

  const onSale     = discountPercent >= 5
  const trending   = boughtLast > 500
  const newArrival = faker.datatype.boolean(0.15)
  const topRated   = stars >= 4.5 && reviews >= 100
  const featured   = isBestSeller || (stars >= 4.3 && reviews >= 50)

  const ratingDist = buildRatingDistribution(reviews, stars)
  const reviewDocs = makeReviews(reviews, stars)

  return {
    id:             `amz_${asin}`,
    slug,
    title,
    brand,
    description,
    category:       meta.parent,
    subcategory:    meta.sub,
    subSubcategory: '',
    imgKeyword:     meta.sub,
    tags,
    attributes,
    variants,

    pricing: {
      original:        parseFloat(originalPrice.toFixed(2)),
      current:         price,
      discountPercent,
      currency:        'USD',
      priceHistory:    [],
    },

    inventory: {
      stock,
      sold,
      reserved:    faker.number.int({ min: 0, max: 10 }),
      warehouse:   pick(['WH-East-01', 'WH-West-01', 'WH-Central-01', 'WH-South-01']),
      restockDate: stock < 10 ? faker.date.future({ years: 0.25 }).toISOString() : null,
    },

    media: {
      thumb:  imgUrl,
      full:   imgUrl.replace('_AC_UL320_', '_AC_UL600_'),
      images: imgUrl ? [imgUrl] : [],
    },

    ratings: {
      average:      stars,
      count:        reviews,
      distribution: ratingDist,
    },

    reviews: reviewDocs,

    shipping: {
      weight:         `${faker.number.float({ min: 0.1, max: 10, fractionDigits: 1 })}kg`,
      dimensions:     { l: faker.number.int({ min: 5, max: 60 }), w: faker.number.int({ min: 5, max: 40 }), h: faker.number.int({ min: 1, max: 30 }), unit: 'cm' },
      freeShipping:   price >= 25 || faker.datatype.boolean(0.3),
      estimatedDays:  { min: estDaysMin, max: estDaysMax },
      expressAvailable: faker.datatype.boolean(0.5),
    },

    seo: {
      metaTitle:       title.slice(0, 60),
      metaDescription: description.slice(0, 160),
    },

    featured,
    bestSeller:  isBestSeller,
    newArrival,
    trending,
    topRated,
    onSale,
    condition:   'New',
    isActive:    true,
    createdAt:   faker.date.past({ years: 3 }).toISOString(),
    updatedAt:   new Date().toISOString(),
  }
}

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🔗  Connecting to MongoDB...')
  await mongoose.connect(MONGODB_URI)
  console.log('✅  Connected')

  let headers: string[] = []
  let batch: any[]      = []
  let total   = 0
  let skipped = 0
  let lineNum = 0

  const rl = readline.createInterface({
    input: fs.createReadStream(PRODUCTS_CSV, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  })

  console.log(`🚀  Streaming ${PRODUCTS_CSV}...`)
  console.log(`🎯  Target: ${TARGET_TOTAL.toLocaleString()} products\n`)

  for await (const line of rl) {
    if (total >= TARGET_TOTAL) break
    lineNum++

    if (lineNum === 1) {
      headers = parseCSVLine(line)
      continue
    }

    const values = parseCSVLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = values[i] ?? '' })

    const doc = transform(row, lineNum)
    if (!doc) { skipped++; continue }

    batch.push(doc)

    if (batch.length >= BATCH_SIZE) {
      await upsertBatch(batch)
      total += batch.length
      batch  = []
      process.stdout.write(`\r   ✅  ${total.toLocaleString()} / ${TARGET_TOTAL.toLocaleString()} inserted   skipped: ${skipped}`)
    }
  }

  // Flush remaining
  if (batch.length > 0 && total < TARGET_TOTAL) {
    await upsertBatch(batch)
    total += batch.length
  }

  console.log(`\n\n🎉  Import complete!`)
  console.log(`   Inserted/updated: ${total.toLocaleString()}`)
  console.log(`   Skipped (invalid): ${skipped.toLocaleString()}`)
  await mongoose.disconnect()
}

async function upsertBatch(docs: any[]) {
  const ops = docs.map(doc => ({
    updateOne: {
      filter: { id: doc.id } as any,
      update: { $set: doc } as any,
      upsert: true,
    },
  }))
  await (Product as any).bulkWrite(ops, { ordered: false })
}

main().catch(err => { console.error('\n❌  Import failed:', err.message); process.exit(1) })