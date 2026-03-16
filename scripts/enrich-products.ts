/**
 * enrich-products.ts
 *
 * Reads products from MongoDB, sends batches to GPT-4o-mini to extract
 * real attributes from product titles, then updates MongoDB + resyncs Algolia.
 *
 * Usage:
 *   npx ts-node scripts/enrich-products.ts
 *
 * What GPT does per product:
 *   - Extracts real brand from title
 *   - Extracts real attributes (size, color, material, specs etc)
 *   - Assigns sensible colors based on title keywords
 *   - All based on the actual title text — no hallucination
 */

import * as dotenv from 'dotenv'
dotenv.config()

import mongoose from 'mongoose'
import OpenAI from 'openai'

const MONGODB_URI    = process.env.MONGODB_URI!
const OPENAI_API_KEY = process.env.OPENAI_API_KEY!
const ALGOLIA_APP_ID    = process.env.ALGOLIA_APP_ID!
const ALGOLIA_WRITE_KEY = process.env.ALGOLIA_WRITE_KEY!
const INDEX_NAME        = process.env.ALGOLIA_INDEX ?? 'products'

if (!MONGODB_URI || !OPENAI_API_KEY) {
  console.error('Missing MONGODB_URI or OPENAI_API_KEY in .env')
  process.exit(1)
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

// ── Mongoose ──────────────────────────────────────────────────────────────────
const ProductSchema = new mongoose.Schema({}, { strict: false })
const Product = mongoose.models.Product ?? mongoose.model('Product', ProductSchema, 'products')

// ── Valid color names ─────────────────────────────────────────────────────────
const VALID_COLORS = new Set([
  'Black', 'White', 'Gray', 'Grey', 'Silver', 'Red', 'Blue', 'Navy', 'Green',
  'Pink', 'Purple', 'Yellow', 'Orange', 'Brown', 'Beige', 'Tan', 'Ivory',
  'Cream', 'Gold', 'Rose Gold', 'Bronze', 'Copper', 'Teal', 'Turquoise',
  'Maroon', 'Burgundy', 'Olive', 'Khaki', 'Charcoal', 'Coral', 'Lavender',
  'Mint', 'Lime', 'Indigo', 'Violet', 'Magenta', 'Cyan', 'Aqua', 'Multicolor',
  'Space Gray', 'Midnight', 'Starlight', 'Natural', 'Clear', 'Transparent',
])

const COLOR_HEX: Record<string, string> = {
  'Black': '#1a1a1a', 'White': '#ffffff', 'Gray': '#808080', 'Grey': '#808080',
  'Silver': '#c0c0c0', 'Red': '#dc2626', 'Blue': '#2563eb', 'Navy': '#1e3a5f',
  'Green': '#16a34a', 'Pink': '#ec4899', 'Purple': '#9333ea', 'Yellow': '#eab308',
  'Orange': '#f97316', 'Brown': '#92400e', 'Beige': '#f5f0e8', 'Tan': '#d2b48c',
  'Ivory': '#fffff0', 'Cream': '#fffdd0', 'Gold': '#ffd700', 'Rose Gold': '#b76e79',
  'Bronze': '#cd7f32', 'Copper': '#b87333', 'Teal': '#0d9488', 'Turquoise': '#40e0d0',
  'Maroon': '#800000', 'Burgundy': '#800020', 'Olive': '#808000', 'Khaki': '#c3b091',
  'Charcoal': '#36454f', 'Coral': '#ff7f50', 'Lavender': '#e6e6fa', 'Mint': '#98ff98',
  'Lime': '#32cd32', 'Indigo': '#4b0082', 'Violet': '#ee82ee', 'Magenta': '#ff00ff',
  'Cyan': '#00ffff', 'Aqua': '#00ffff', 'Multicolor': '#ff6b6b', 'Space Gray': '#6b7280',
  'Midnight': '#191970', 'Starlight': '#f8f4e3', 'Natural': '#f5f0e8',
}

// ── GPT prompt ────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a product data enrichment AI for an ecommerce platform.
Given a list of products (title + category), extract structured data for each.

Rules:
- brand: Extract ONLY if clearly present in title (e.g. "Nike", "Samsung", "Sony"). If not clear, return null.
- attributes: Extract ONLY attributes that are EXPLICITLY mentioned or strongly implied by the title. Do NOT invent specs.
  Common attributes by category:
  - shoes/footwear: material, closure, width, sole, waterproof
  - clothing: material, fit, gender, sleeve
  - electronics/laptops: brand, storage, ram, screenSize, processor
  - phones: brand, storage, ram, screenSize
  - tvs: brand, screenSize, resolution, displayType, smartTV
  - headphones: type, connectivity, noiseCancelling
  - luggage/bags: material, wheels, capacity, lockType
  - beauty/skincare: skinType, volume, spf, finish
  - books: format, language, genre, pages
  - toys: ageRange, material, batteries
  - furniture: material, assembly, style
  - kitchen: material, capacity, dishwasherSafe
  - sports: sport, level, material
  - automotive: compatibility, material
  - health/supplements: form, count, certifications
  
- colors: Extract ONLY colors explicitly mentioned in the title. Return [] if none mentioned.
  Valid colors only: Black, White, Gray, Silver, Red, Blue, Navy, Green, Pink, Purple, 
  Yellow, Orange, Brown, Beige, Tan, Gold, Rose Gold, Teal, Maroon, Burgundy, Olive, 
  Khaki, Charcoal, Coral, Lavender, Mint, Lime, Multicolor, Space Gray, Midnight, Natural
  
- sizes: Extract ONLY sizes explicitly mentioned in title (e.g. "Size 10", "Large", "55-Inch", "1TB").
  Return [] if none mentioned.

Return ONLY valid JSON array, no markdown, no explanation:
[
  {
    "id": "product_id",
    "brand": "Nike" or null,
    "attributes": { "key": "value" },
    "colors": ["Black", "White"],
    "sizes": ["10", "11"]
  }
]`

// ── Process batch with GPT ────────────────────────────────────────────────────

async function enrichBatch(products: any[]): Promise<Map<string, any>> {
  const input = products.map(p => ({
    id: p.id,
    title: p.title,
    category: p.category,
    subcategory: p.subcategory,
  }))

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(input) },
    ],
    temperature: 0.1,
    response_format: { type: 'json_object' },
  })

  const raw = response.choices[0].message.content ?? '{"results":[]}'
  
  let parsed: any[]
  try {
    const obj = JSON.parse(raw)
    // GPT sometimes wraps in object
    parsed = Array.isArray(obj) ? obj : (obj.results ?? obj.products ?? obj.data ?? [])
  } catch {
    return new Map()
  }

  const map = new Map<string, any>()
  for (const item of parsed) {
    if (item?.id) map.set(item.id, item)
  }
  return map
}

// ── Build Algolia record from enriched product ────────────────────────────────

function buildAlgoliaRecord(product: any): Record<string, any> {
  const attrValues: string[] = []
  if (product.attributes && typeof product.attributes === 'object') {
    for (const [k, v] of Object.entries(product.attributes)) {
      if (v && v !== 'N/A' && !Array.isArray(v)) {
        attrValues.push(`${k}:${String(v)}`)
      }
    }
  }

  const colorHexMap: Record<string, string> = {}
  for (const color of (product.colors ?? [])) {
    colorHexMap[color] = COLOR_HEX[color] ?? '#888888'
  }

  return {
    objectID: product.id,
    id: product.id,
    slug: product.slug,
    title: product.title ?? '',
    brand: product.brand ?? '',
    category: product.category ?? '',
    subcategory: product.subcategory ?? '',
    description: product.description ?? '',
    tags: product.tags ?? [],
    price: product.pricing?.current ?? 0,
    originalPrice: product.pricing?.original ?? 0,
    discountPercent: product.pricing?.discountPercent ?? 0,
    currency: product.pricing?.currency ?? 'USD',
    avgRating: product.ratings?.average ?? 0,
    ratingCount: product.ratings?.count ?? 0,
    stock: product.inventory?.stock ?? 0,
    soldCount: product.inventory?.sold ?? 0,
    warehouse: product.inventory?.warehouse ?? '',
    inStock: (product.inventory?.stock ?? 0) > 0,
    freeShipping: product.shipping?.freeShipping ?? false,
    expressAvailable: product.shipping?.expressAvailable ?? false,
    featured: product.featured ?? false,
    bestSeller: product.bestSeller ?? false,
    newArrival: product.newArrival ?? false,
    trending: product.trending ?? false,
    topRated: product.topRated ?? false,
    onSale: product.onSale ?? false,
    condition: product.condition ?? 'New',
    colors: product.colors ?? [],
    sizes: product.sizes ?? [],
    colorHexMap,
    attrValues,
    attributes: product.attributes ?? {},
    thumb: product.media?.thumb ?? '',
    imageUrl: product.media?.full ?? '',
    createdAtMs: new Date(product.createdAt ?? Date.now()).getTime(),
    createdAt: product.createdAt,
    isActive: product.isActive ?? true,
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🔗  Connecting to MongoDB...')
  await mongoose.connect(MONGODB_URI)
  console.log('✅  Connected\n')

  const total = await (Product as any).countDocuments({ isActive: true })
  console.log(`📦  Total products to enrich: ${total.toLocaleString()}`)
  console.log(`🤖  Using GPT-4o-mini in batches of 50\n`)

  // Setup Algolia
  let algoliaClient: any = null
  if (ALGOLIA_APP_ID && ALGOLIA_WRITE_KEY) {
    const { algoliasearch } = await import('algoliasearch')
    algoliaClient = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_WRITE_KEY)
    console.log('✅  Algolia connected\n')
  }

  const BATCH_SIZE = 50
  let processed = 0
  let errors = 0
  let skip = 0

  while (processed + errors < total) {
    // Fetch batch from MongoDB
    const batch = await (Product as any)
      .find({ isActive: true })
      .skip(skip)
      .limit(BATCH_SIZE)
      .lean()

    if (batch.length === 0) break
    skip += batch.length

    try {
      // Get GPT enrichment
      const enriched = await enrichBatch(batch)

      // Build updates
      const mongoOps: any[] = []
      const algoliaObjects: any[] = []

      for (const product of batch) {
        const gpt = enriched.get(product.id)

        // Validate and clean colors
        const rawColors: string[] = gpt?.colors ?? []
        const cleanColors = rawColors.filter((c: string) => VALID_COLORS.has(c))

        // Clean sizes
        const cleanSizes: string[] = (gpt?.sizes ?? []).map((s: any) => String(s))

        // Build attributes — keep only non-null values
        const attributes: Record<string, string> = {}
        if (gpt?.attributes) {
          for (const [k, v] of Object.entries(gpt.attributes)) {
            if (v !== null && v !== undefined && v !== '' && v !== 'N/A') {
              attributes[k] = String(v)
            }
          }
        }

        const update = {
          brand:      gpt?.brand ?? product.brand ?? '',
          attributes,
          colors:     cleanColors,
          sizes:      cleanSizes,
          colorHexMap: Object.fromEntries(
            cleanColors.map((c: string) => [c, COLOR_HEX[c] ?? '#888888'])
          ),
        }

        mongoOps.push({
          updateOne: {
            filter: { id: product.id } as any,
            update: { $set: update } as any,
          },
        })

        // Build full Algolia record with enriched data
        algoliaObjects.push(buildAlgoliaRecord({ ...product, ...update }))
      }

      // Update MongoDB
      if (mongoOps.length > 0) {
        await (Product as any).bulkWrite(mongoOps, { ordered: false })
      }

      // Update Algolia
      if (algoliaClient && algoliaObjects.length > 0) {
        await algoliaClient.saveObjects({
          indexName: INDEX_NAME,
          objects: algoliaObjects,
        })
      }

      processed += batch.length
      process.stdout.write(
        `\r   ✅  ${processed.toLocaleString()} / ${total.toLocaleString()} enriched   errors: ${errors}`
      )

    } catch (err: any) {
      errors += batch.length
      process.stdout.write(
        `\r   ⚠️   ${processed.toLocaleString()} / ${total.toLocaleString()} enriched   errors: ${errors} (${err.message})`
      )
      // Wait before retry on rate limit
      if (err.status === 429) await new Promise(r => setTimeout(r, 10000))
    }

    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 200))
  }

  console.log(`\n\n🎉  Enrichment complete!`)
  console.log(`   Processed: ${processed.toLocaleString()}`)
  console.log(`   Errors:    ${errors.toLocaleString()}`)

  await mongoose.disconnect()
}

main().catch(err => {
  console.error('\n❌  Failed:', err.message)
  process.exit(1)
})