import * as dotenv from 'dotenv'
dotenv.config()

import mongoose from 'mongoose'
import { algoliasearch } from 'algoliasearch'

const MONGODB_URI       = process.env.MONGODB_URI!
const ALGOLIA_APP_ID    = process.env.ALGOLIA_APP_ID!
const ALGOLIA_WRITE_KEY = process.env.ALGOLIA_WRITE_KEY!
const INDEX_NAME        = process.env.ALGOLIA_INDEX ?? 'products'

if (!MONGODB_URI || !ALGOLIA_APP_ID || !ALGOLIA_WRITE_KEY) {
  console.error('Missing env vars: MONGODB_URI, ALGOLIA_APP_ID, ALGOLIA_WRITE_KEY')
  process.exit(1)
}

function toRecord(product: any): Record<string, any> {
  const attrValues: string[] = []
  if (product.attributes && typeof product.attributes === 'object') {
    for (const [k, v] of Object.entries(product.attributes)) {
      if (v && v !== 'N/A' && !Array.isArray(v)) attrValues.push(`${k}:${String(v)}`)
    }
  }
  const colorMap: Record<string, string> = {}
  const sizes: string[] = []
  for (const v of (product.variants ?? [])) {
    if (v.color) colorMap[v.color] = v.colorHex ?? '#cccccc'
    if (v.size) sizes.push(String(v.size))
  }
  return {
    objectID: product.id, id: product.id, slug: product.slug,
    title: product.title ?? '', brand: product.brand ?? '',
    category: product.category ?? '', subcategory: product.subcategory ?? '',
    description: product.description ?? '', tags: product.tags ?? [],
    price: product.pricing?.current ?? 0, originalPrice: product.pricing?.original ?? 0,
    discountPercent: product.pricing?.discountPercent ?? 0, currency: product.pricing?.currency ?? 'USD',
    avgRating: product.ratings?.average ?? 0, ratingCount: product.ratings?.count ?? 0,
    stock: product.inventory?.stock ?? 0, soldCount: product.inventory?.sold ?? 0,
    warehouse: product.inventory?.warehouse ?? '', inStock: (product.inventory?.stock ?? 0) > 0,
    freeShipping: product.shipping?.freeShipping ?? false, expressAvailable: product.shipping?.expressAvailable ?? false,
    featured: product.featured ?? false, bestSeller: product.bestSeller ?? false,
    newArrival: product.newArrival ?? false, trending: product.trending ?? false,
    topRated: product.topRated ?? false, onSale: product.onSale ?? false,
    condition: product.condition ?? 'New',
    colors: Object.keys(colorMap), sizes: [...new Set(sizes)], colorHexMap: colorMap,
    attrValues, attributes: product.attributes ?? {},
    thumb: product.media?.thumb ?? '', imageUrl: product.media?.full ?? '',
    createdAtMs: new Date(product.createdAt ?? Date.now()).getTime(),
    createdAt: product.createdAt, isActive: product.isActive ?? true,
  }
}

async function main() {
  console.log('Connecting to MongoDB...')
  await mongoose.connect(MONGODB_URI)
  console.log('Connected')

  const Product  = mongoose.model('Product', new mongoose.Schema({}, { strict: false }), 'products')
  const products = await Product.find({ isActive: true }).lean()
  console.log(`Found ${products.length} active products`)

  const client  = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_WRITE_KEY)
  const objects = products.map(toRecord)
  const CHUNK   = 1000

  console.log(`Pushing to Algolia index "${INDEX_NAME}"...`)
  for (let i = 0; i < objects.length; i += CHUNK) {
    await client.saveObjects({ indexName: INDEX_NAME, objects: objects.slice(i, i + CHUNK) })
    console.log(`  ${Math.min(i + CHUNK, objects.length)} / ${objects.length}`)
  }
  console.log(`Done! ${objects.length} products synced.`)
  await mongoose.disconnect()
}

main().catch((err) => { console.error('Sync failed:', err.message); process.exit(1) })