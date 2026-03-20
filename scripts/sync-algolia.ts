/**
 * sync-algolia.ts
 *
 * Syncs all active products from MongoDB → Algolia.
 * Uses the same toRecord() logic as AlgoliaService so both
 * the live API and this script produce identical records.
 *
 * Run:
 *   npx ts-node scripts/sync-algolia.ts
 */

import * as dotenv from 'dotenv'
dotenv.config()

import mongoose from 'mongoose'
import { algoliasearch } from 'algoliasearch'

const MONGODB_URI       = process.env.MONGODB_URI!
const ALGOLIA_APP_ID    = process.env.ALGOLIA_APP_ID!
const ALGOLIA_WRITE_KEY = process.env.ALGOLIA_WRITE_KEY!
const INDEX_NAME        = process.env.ALGOLIA_INDEX ?? 'products'

if (!MONGODB_URI || !ALGOLIA_APP_ID || !ALGOLIA_WRITE_KEY) {
  console.error('❌  Missing env vars: MONGODB_URI, ALGOLIA_APP_ID, ALGOLIA_WRITE_KEY')
  process.exit(1)
}

// ── toRecord — mirrors AlgoliaService.toRecord() exactly ──────────────────────

function toRecord(product: any): Record<string, any> {
  // attrValues — prefer stored array, fall back to building from attributes
  let attrValues: string[] = product.attrValues ?? []
  if (attrValues.length === 0 && product.attributes && typeof product.attributes === 'object') {
    for (const [k, v] of Object.entries(product.attributes)) {
      if (v && v !== 'N/A' && v !== '' && !Array.isArray(v)) {
        attrValues.push(`${k}:${String(v)}`)
      }
    }
  }

  // colorHexMap from variants
  const colorHexMap: Record<string, string> = {}
  for (const variant of product.variants ?? []) {
    if (variant.color && variant.colorHex) colorHexMap[variant.color] = variant.colorHex
  }

  // Colors / sizes — prefer stored arrays, fall back to extracting from variants
  const colors = product.colors?.length
    ? product.colors
    : [...new Set((product.variants ?? []).map((v: any) => v.color).filter(Boolean))]
  const sizes = [...new Set((product.sizes ?? []).map(String))]

  // Flat numeric helpers — prefer direct field, fall back to nested
  const price            = product.price           ?? product.pricing?.current           ?? 0
  const originalPrice    = product.pricing?.original                                     ?? price
  const discountPercent  = product.discountPercent  ?? product.pricing?.discountPercent   ?? 0
  const avgRating        = product.avgRating        ?? product.ratings?.average           ?? 0
  const soldCount        = product.soldCount        ?? product.inventory?.sold            ?? 0
  const stock            = product.availability?.stockLevel ?? product.inventory?.stock   ?? 0
  const isPrime          = product.isPrime          ?? product.delivery?.isPrime          ?? false
  const freeShipping     = product.freeShipping     ?? product.delivery?.isFreeShipping   ?? product.shipping?.freeShipping ?? false
  const expressAvailable = product.expressAvailable ?? product.delivery?.expressAvailable ?? product.shipping?.expressAvailable ?? false
  const inStock          = product.inStock          ?? stock > 0
  const warehouse        = product.warehouse        ?? product.inventory?.warehouse       ?? ''
  const mainImage        = product.media?.mainImage ?? product.media?.images?.[0]?.url   ?? product.media?.thumb ?? ''
  const createdAtMs      = product.createdAtMs      ?? new Date(product.createdAt ?? Date.now()).getTime()

  return {
    objectID:           product.id,
    id:                 product.id,
    slug:               product.slug,
    asin:               product.asin               ?? '',
    title:              product.title              ?? '',
    brand:              product.brand              ?? '',
    manufacturer:       product.manufacturer       ?? product.brand ?? '',
    category:           product.category           ?? '',
    subcategory:        product.subcategory        ?? '',
    subSubcategory:     product.subSubcategory     ?? '',
    categoryId:         product.categoryInfo?.id   ?? '',
    categoryNodeId:     product.categoryInfo?.nodeId ?? '',
    categoryPath:       product.categoryInfo?.path ?? '',
    categoryName:       product.categoryInfo?.name ?? '',
    description:        product.description        ?? '',
    tags:               product.tags               ?? [],
    featureBullets:     product.featureBullets     ?? [],

    // Pricing
    price,
    originalPrice,
    discountPercent,
    discountAmount:     product.pricing?.discountAmount ?? 0,
    currency:           product.pricing?.currency      ?? 'USD',
    isDeal:             product.pricing?.isDeal        ?? false,
    hasCoupon:          product.pricing?.coupon?.hasCoupon ?? false,

    // Ratings
    avgRating,
    ratingCount:        product.ratings?.total ?? product.ratings?.count ?? 0,

    // Inventory
    stock,
    soldCount,
    warehouse,
    inStock,
    availabilityStatus: product.availability?.status ?? (inStock ? 'in_stock' : 'out_of_stock'),

    // Delivery
    isPrime,
    freeShipping,
    expressAvailable,
    fulfilledByAmazon:  product.delivery?.isFulfilledByAmazon ?? false,
    soldByAmazon:       product.delivery?.isSoldByAmazon      ?? false,

    // Boolean badge flags
    featured:           product.featured        ?? false,
    bestSeller:         product.bestSeller      ?? false,
    newArrival:         product.newArrival      ?? false,
    trending:           product.trending        ?? false,
    topRated:           product.topRated        ?? false,
    onSale:             product.onSale          ?? false,
    isAmazonsChoice:    product.badges?.isAmazonsChoice ?? false,
    isNewRelease:       product.badges?.isNewRelease    ?? false,
    recentSales:        product.badges?.recentSales     ?? null,

    condition:          product.condition ?? product.shipping?.condition ?? 'New',
    isActive:           product.isActive ?? true,

    // Variant-derived facets
    colors,
    sizes,
    colorHexMap,

    // Dynamic attribute facets
    attrValues,
    attributes:         product.attributes ?? {},

    // Images
    mainImage,
    imageUrl:           mainImage,
    thumb:              mainImage,

    // Sort helpers
    createdAtMs,
    createdAt:          product.createdAt,
    amazonUrl:          product.metadata?.amazonUrl ?? '',
    dateFirstAvailable: product.metadata?.dateFirstAvailable ?? '',
  }
}

// ── Configure Algolia index settings ──────────────────────────────────────────

async function configureIndex(client: any) {
  console.log('⚙️   Configuring Algolia index settings…')

  await client.setSettings({
    indexName: INDEX_NAME,
    indexSettings: {

      // ── Searchable attributes — ordered by relevance weight ──────────────────
      searchableAttributes: [
        'title',
        'brand',
        'unordered(tags)',
        'unordered(asin)',
        'unordered(category)',
        'unordered(subcategory)',
        'unordered(categoryPath)',
        'unordered(featureBullets)',
        'unordered(description)',
      ],

      // ── Faceting ─────────────────────────────────────────────────────────────
      attributesForFaceting: [
        'searchable(brand)',
        'searchable(category)',
        'searchable(subcategory)',
        'searchable(colors)',
        'searchable(sizes)',
        'searchable(condition)',
        'searchable(warehouse)',
        'attrValues',
        'inStock',
        'isPrime',
        'freeShipping',
        'expressAvailable',
        'onSale',
        'bestSeller',
        'featured',
        'newArrival',
        'topRated',
        'trending',
      ],

      // ── Numeric filters ───────────────────────────────────────────────────────
      numericAttributesForFiltering: ['price','avgRating','discountPercent','createdAtMs','soldCount'],

      // ── Retrieval ─────────────────────────────────────────────────────────────
      attributesToRetrieve: ['*'],

      // ── Highlighting — <mark> tags around matched words ───────────────────────
      attributesToHighlight: ['title', 'brand', 'description'],
      attributesToSnippet:   ['description:20', 'featureBullets:15'],
      highlightPreTag:       '<mark>',
      highlightPostTag:      '</mark>',

      // ── Custom ranking ────────────────────────────────────────────────────────
      customRanking: [
        'desc(bestSeller)',
        'desc(avgRating)',
        'desc(soldCount)',
        'desc(isPrime)',
        'asc(discountPercent)',
      ],

      // ── Replicas ──────────────────────────────────────────────────────────────
      replicas: [
        `${INDEX_NAME}_price_asc`,
        `${INDEX_NAME}_price_desc`,
        `${INDEX_NAME}_rating_desc`,
        `${INDEX_NAME}_newest`,
        `${INDEX_NAME}_bestselling`,
        `${INDEX_NAME}_discount_desc`,
      ],

      // ── Typo tolerance ────────────────────────────────────────────────────────
      typoTolerance:        true,
      minWordSizefor1Typo:  4,
      minWordSizefor2Typos: 8,

      // ── Language ──────────────────────────────────────────────────────────────
      ignorePlurals:   true,
      removeStopWords: true,

      // ── Search behavior ───────────────────────────────────────────────────────
      advancedSyntax:      true,
      queryType:           'prefixLast',
      hitsPerPage:         20,
      maxFacetHits:        100,
      paginationLimitedTo: 1000,


      // ── Ranking formula ───────────────────────────────────────────────────────
      ranking: [
        'typo', 'geo', 'words', 'filters',
        'proximity', 'attribute', 'exact', 'custom',
      ],
    },
  })

  // ── Sort replicas ──────────────────────────────────────────────────────────
  const replicaConfigs: Array<[string, string, string]> = [
    [`${INDEX_NAME}_price_asc`,     'price',           'asc'],
    [`${INDEX_NAME}_price_desc`,    'price',           'desc'],
    [`${INDEX_NAME}_rating_desc`,   'avgRating',       'desc'],
    [`${INDEX_NAME}_newest`,        'createdAtMs',     'desc'],
    [`${INDEX_NAME}_bestselling`,   'soldCount',       'desc'],
    [`${INDEX_NAME}_discount_desc`, 'discountPercent', 'desc'],
  ]

  await Promise.allSettled(
    replicaConfigs.map(([name, field, dir]) =>
      client.setSettings({
        indexName: name,
        indexSettings: {
          ranking: [
            `${dir}(${field})`,
            'typo','geo','words','filters',
            'proximity','attribute','exact','custom',
          ],
          customRanking: [
            'desc(bestSeller)',
            'desc(avgRating)',
            'desc(soldCount)',
          ],
        },
      }),
    ),
  )

  console.log('✅  Index settings configured\n')
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🔗  Connecting to MongoDB…')
  await mongoose.connect(MONGODB_URI)
  console.log('✅  Connected\n')

  const Product  = mongoose.model('Product', new mongoose.Schema({}, { strict: false }), 'products')
  const products = await Product.find({ isActive: true }).lean()
  console.log(`📦  Found ${products.length.toLocaleString()} active products`)

  const client = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_WRITE_KEY)

  // Configure index first
  await configureIndex(client)

  // Sync all products
  const objects = products.map(toRecord)
  const CHUNK   = 1000

  console.log(`🚀  Syncing to Algolia index "${INDEX_NAME}"…`)
  for (let i = 0; i < objects.length; i += CHUNK) {
    await client.saveObjects({ indexName: INDEX_NAME, objects: objects.slice(i, i + CHUNK) })
    process.stdout.write(`\r   ${Math.min(i + CHUNK, objects.length).toLocaleString()} / ${objects.length.toLocaleString()}`)
  }

  console.log(`\n\n✅  Done! ${objects.length.toLocaleString()} products synced to Algolia.\n`)
  await mongoose.disconnect()
}

main().catch((err) => {
  console.error('❌  Sync failed:', err.message)
  process.exit(1)
})
