import Fuse from 'fuse.js'
import { smartPaginate } from './api-utils'

export interface FilterQuery {
  q?: string
  category?: string
  subcategory?: string
  brand?: string
  minPrice?: number
  maxPrice?: number
  rating?: number
  inStock?: boolean
  freeShipping?: boolean
  featured?: boolean
  bestSeller?: boolean
  newArrival?: boolean
  trending?: boolean
  topRated?: boolean
  onSale?: boolean
  attrs?: string
  sort?: string
  page?: number
  limit?: number
  cursor?: string
  includeFacets?: boolean
}

function parseBool(val: any): boolean | null {
  if (val === true || val === 'true' || val === '1') return true
  if (val === false || val === 'false' || val === '0') return false
  return null
}

export function filterProducts(products: any[], query: FilterQuery) {
  const startTime = Date.now()
  let result = [...products]

  // BUG-04 fix: apply all exact / deterministic filters FIRST to reduce the
  // candidate set as much as possible, then run Fuse.js only on that smaller
  // set. Previously Fuse ran across the entire catalogue before category/brand
  // filters were applied, wasting CPU and producing worse relevance scores
  // because it was ranking against irrelevant products.

  // ── 1. Exact filters (cheapest — O(n) single-pass) ───────────────────────
  if (query.category) result = result.filter((p) => p.category === query.category)
  if (query.subcategory) result = result.filter((p) => p.subcategory === query.subcategory)

  if (query.brand) {
    const brands = query.brand.split(',').map((b) => b.trim().toLowerCase())
    result = result.filter((p) => brands.includes(p.brand.toLowerCase()))
  }

  if (query.minPrice != null)
    result = result.filter((p) => p.pricing.current >= Number(query.minPrice))
  if (query.maxPrice != null)
    result = result.filter((p) => p.pricing.current <= Number(query.maxPrice))
  if (query.rating) result = result.filter((p) => p.ratings.average >= Number(query.rating))

  const boolFlags = [
    'featured',
    'bestSeller',
    'newArrival',
    'trending',
    'topRated',
    'onSale',
  ] as const
  for (const flag of boolFlags) {
    const val = parseBool((query as any)[flag])
    if (val !== null) result = result.filter((p) => p[flag] === val)
  }

  const inStock = parseBool(query.inStock)
  if (inStock !== null)
    result = inStock
      ? result.filter((p) => p.inventory.stock > 0)
      : result.filter((p) => p.inventory.stock === 0)

  const freeShipping = parseBool(query.freeShipping)
  if (freeShipping !== null)
    result = result.filter((p) => p.shipping?.freeShipping === freeShipping)

  // BUG-05 fix: split on the FIRST colon only, not all colons.
  // e.g. "color:#FF5733" correctly produces key="color", value="#FF5733".
  // The old pair.split(':') would produce ['color','#FF5733'] by luck, but
  // "time:12:00" would produce ['time','12','00'] and '00' would be dropped.
  if (query.attrs) {
    const pairs = query.attrs.split(',').map((a) => a.trim())
    for (const pair of pairs) {
      const colonIdx = pair.indexOf(':')
      if (colonIdx === -1) continue
      const key = pair.slice(0, colonIdx).trim()
      const value = pair.slice(colonIdx + 1).trim()
      if (key && value) {
        result = result.filter(
          (p) => p.attributes && String(p.attributes[key]).toLowerCase() === value.toLowerCase(),
        )
      }
    }
  }

  // ── 2. Fuzzy search — runs on already-filtered set (BUG-04) ─────────────
  if (query.q && query.q.trim()) {
    const fuse = new Fuse(result, {
      keys: ['title', 'brand', 'description', 'tags'],
      threshold: 0.3,
      includeScore: true,
    })
    result = fuse.search(query.q.trim()).map((r) => ({ ...r.item, _score: r.score }))
  }

  // ── 3. Sort ──────────────────────────────────────────────────────────────
  switch (query.sort ?? 'relevance') {
    case 'price_asc':
      result.sort((a, b) => a.pricing.current - b.pricing.current)
      break
    case 'price_desc':
      result.sort((a, b) => b.pricing.current - a.pricing.current)
      break
    case 'rating_desc':
      result.sort((a, b) => b.ratings.average - a.ratings.average)
      break
    case 'newest':
      result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      break
    case 'bestselling':
      result.sort((a, b) => (b.inventory?.sold ?? 0) - (a.inventory?.sold ?? 0))
      break
    case 'discount_desc':
      result.sort((a, b) => b.pricing.discountPercent - a.pricing.discountPercent)
      break
    default:
      if (query.q) result.sort((a: any, b: any) => (a._score ?? 1) - (b._score ?? 1))
      break
  }

  // ── 4. Paginate ──────────────────────────────────────────────────────────
  const paginated = smartPaginate(result, {
    page: query.page,
    limit: query.limit ?? 20,
    cursor: query.cursor,
  })

  // Build applied-filters list
  const appliedFilters: any[] = []
  if (query.q) appliedFilters.push({ key: 'q', value: query.q, label: `Search: ${query.q}` })
  if (query.category)
    appliedFilters.push({
      key: 'category',
      value: query.category,
      label: `Category: ${query.category}`,
    })
  if (query.brand)
    query.brand
      .split(',')
      .forEach((b) =>
        appliedFilters.push({ key: 'brand', value: b.trim(), label: `Brand: ${b.trim()}` }),
      )
  if (query.minPrice)
    appliedFilters.push({
      key: 'minPrice',
      value: query.minPrice,
      label: `Min: $${query.minPrice}`,
    })
  if (query.maxPrice)
    appliedFilters.push({
      key: 'maxPrice',
      value: query.maxPrice,
      label: `Max: $${query.maxPrice}`,
    })
  if (query.rating)
    appliedFilters.push({ key: 'rating', value: query.rating, label: `${query.rating}★+` })
  if (parseBool(query.inStock) === true)
    appliedFilters.push({ key: 'inStock', value: true, label: 'In Stock' })
  if (parseBool(query.freeShipping) === true)
    appliedFilters.push({ key: 'freeShipping', value: true, label: 'Free Shipping' })
  for (const f of boolFlags) {
    if (parseBool((query as any)[f]) === true)
      appliedFilters.push({ key: f, value: true, label: f })
  }
  if (query.attrs) {
    query.attrs.split(',').forEach((pair) => {
      const ci = pair.indexOf(':')
      if (ci !== -1) {
        const k = pair.slice(0, ci).trim(),
          v = pair.slice(ci + 1).trim()
        if (k && v) appliedFilters.push({ key: k, value: v, label: `${k}: ${v}` })
      }
    })
  }

  return {
    ...paginated,
    appliedFilters,
    searchMeta: {
      query: query.q || null,
      totalResults: paginated.total,
      fuzzyMatches: query.q ? result.filter((p: any) => p._score !== undefined).length : 0,
      searchTime: `${Date.now() - startTime}ms`,
      paginationMode: paginated.mode,
    },
    sortOptions: [
      { value: 'relevance', label: 'Most Relevant' },
      { value: 'price_asc', label: 'Price: Low to High' },
      { value: 'price_desc', label: 'Price: High to Low' },
      { value: 'rating_desc', label: 'Top Rated' },
      { value: 'newest', label: 'Newest First' },
      { value: 'bestselling', label: 'Best Selling' },
      { value: 'discount_desc', label: 'Biggest Discount' },
    ],
  }
}
