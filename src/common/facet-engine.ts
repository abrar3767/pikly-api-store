// BUG-02 fix: Disjunctive faceting
//
// The core problem with the old implementation was that it built every facet
// from the *already-filtered* product set. If a user selected brand=Apple,
// the brand facet would show only Apple with its count, making it impossible
// to switch to a different brand. This is the wrong UX — every major eCommerce
// system (Amazon, Flipkart, Zalando) shows all available options in a facet
// dimension even when one is already selected, so users can change their mind.
//
// The correct technique is called "disjunctive faceting": for each facet
// dimension, calculate counts against the result set that has every filter
// applied *except* that dimension's own filter. This way the brand facet
// always shows all brands that have products matching the non-brand filters,
// and the selected brand is highlighted — but not hidden.
//
// Architecture: filterWithout(products, query, excludeKey) re-runs filtering
// omitting one key. For a 500-product catalogue with 8 facet dimensions this
// runs filtering ~8 times, but each run is pure in-memory work on a small
// array, so total time is still sub-millisecond.

import Fuse from 'fuse.js'

function parseBool(val: any): boolean | null {
  if (val === true || val === 'true' || val === '1') return true
  if (val === false || val === 'false' || val === '0') return false
  return null
}

// Applies every filter in query EXCEPT the one named by `excludeKey`.
// Used internally to compute disjunctive facet counts.
function filterWithout(products: any[], query: Record<string, any>, excludeKey: string): any[] {
  let result = [...products]

  if (excludeKey !== 'category' && query.category)
    result = result.filter((p) => p.category === query.category)
  if (excludeKey !== 'subcategory' && query.subcategory)
    result = result.filter((p) => p.subcategory === query.subcategory)

  if (excludeKey !== 'brand' && query.brand) {
    const brands = query.brand.split(',').map((b: string) => b.trim().toLowerCase())
    result = result.filter((p) => brands.includes(p.brand.toLowerCase()))
  }

  if (excludeKey !== 'minPrice' && query.minPrice != null)
    result = result.filter((p) => p.pricing.current >= Number(query.minPrice))
  if (excludeKey !== 'maxPrice' && query.maxPrice != null)
    result = result.filter((p) => p.pricing.current <= Number(query.maxPrice))
  if (excludeKey !== 'rating' && query.rating)
    result = result.filter((p) => p.ratings.average >= Number(query.rating))

  const boolFlags = [
    'featured',
    'bestSeller',
    'newArrival',
    'trending',
    'topRated',
    'onSale',
    'inStock',
    'freeShipping',
  ]
  for (const flag of boolFlags) {
    if (excludeKey !== flag) {
      const val = parseBool(query[flag])
      if (val !== null) {
        if (flag === 'inStock')
          result = val
            ? result.filter((p) => p.inventory.stock > 0)
            : result.filter((p) => p.inventory.stock === 0)
        else if (flag === 'freeShipping')
          result = result.filter((p) => p.shipping?.freeShipping === val)
        else result = result.filter((p) => p[flag] === val)
      }
    }
  }

  if (excludeKey !== 'attrs' && query.attrs) {
    const pairs = query.attrs.split(',').map((a: string) => a.trim())
    for (const pair of pairs) {
      const ci = pair.indexOf(':')
      if (ci === -1) continue
      const key = pair.slice(0, ci).trim(),
        value = pair.slice(ci + 1).trim()
      if (key && value)
        result = result.filter(
          (p) => p.attributes && String(p.attributes[key]).toLowerCase() === value.toLowerCase(),
        )
    }
  }

  if (query.q && query.q.trim()) {
    const fuse = new Fuse(result, {
      keys: ['title', 'brand', 'description', 'tags'],
      threshold: 0.3,
    })
    result = fuse.search(query.q.trim()).map((r) => r.item)
  }

  return result
}

export function buildFacets(allFilteredProducts: any[], activeFilters: Record<string, any>) {
  // ── Brands (disjunctive) ─────────────────────────────────────────────────
  // Count brands against the set with all filters EXCEPT brand, so other
  // brands remain visible when one brand is already selected.
  const brandsBase = filterWithout(allFilteredProducts, activeFilters, 'brand')
  const brandMap: Record<string, number> = {}
  for (const p of brandsBase) brandMap[p.brand] = (brandMap[p.brand] || 0) + 1
  const activeBrands = activeFilters.brand
    ? activeFilters.brand.split(',').map((b: string) => b.trim().toLowerCase())
    : []
  const brands = Object.entries(brandMap)
    .sort((a, b) => b[1] - a[1])
    .map(([value, count]) => ({
      value,
      label: value,
      count,
      selected: activeBrands.includes(value.toLowerCase()),
    }))

  // ── Price range (disjunctive) ────────────────────────────────────────────
  const priceBase = filterWithout(allFilteredProducts, activeFilters, 'minPrice')
  const prices = priceBase.map((p) => p.pricing.current)
  const priceMin = prices.length ? Math.floor(Math.min(...prices)) : 0
  const priceMax = prices.length ? Math.ceil(Math.max(...prices)) : 9999

  // ── Ratings ──────────────────────────────────────────────────────────────
  const ratingsBase = filterWithout(allFilteredProducts, activeFilters, 'rating')
  const ratings = [4, 3, 2, 1].map((star) => ({
    value: star,
    label: `${star}★ & above`,
    count: ratingsBase.filter((p) => p.ratings.average >= star).length,
  }))

  // ── Dynamic attributes (disjunctive) ─────────────────────────────────────
  const attrsBase = filterWithout(allFilteredProducts, activeFilters, 'attrs')
  const attrMap: Record<string, Record<string, number>> = {}
  for (const p of attrsBase) {
    if (!p.attributes) continue
    for (const [key, val] of Object.entries(p.attributes)) {
      if (!val || val === 'N/A' || Array.isArray(val)) continue
      const strVal = String(val)
      if (!attrMap[key]) attrMap[key] = {}
      attrMap[key][strVal] = (attrMap[key][strVal] || 0) + 1
    }
  }

  const activeAttrs: Record<string, string> = {}
  if (activeFilters.attrs) {
    activeFilters.attrs.split(',').forEach((pair: string) => {
      const ci = pair.indexOf(':')
      if (ci !== -1)
        activeAttrs[pair.slice(0, ci).trim()] = pair
          .slice(ci + 1)
          .trim()
          .toLowerCase()
    })
  }

  const attributes: Record<string, any[]> = {}
  for (const [key, vals] of Object.entries(attrMap)) {
    attributes[key] = Object.entries(vals)
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({
        value,
        count,
        selected: activeAttrs[key] === value.toLowerCase(),
      }))
  }

  // ── Badges ───────────────────────────────────────────────────────────────
  const badges = {
    featured: { count: allFilteredProducts.filter((p) => p.featured).length },
    bestSeller: { count: allFilteredProducts.filter((p) => p.bestSeller).length },
    newArrival: { count: allFilteredProducts.filter((p) => p.newArrival).length },
    trending: { count: allFilteredProducts.filter((p) => p.trending).length },
    topRated: { count: allFilteredProducts.filter((p) => p.topRated).length },
    onSale: { count: allFilteredProducts.filter((p) => p.onSale).length },
  }

  const shipping = {
    freeShipping: { count: allFilteredProducts.filter((p) => p.shipping?.freeShipping).length },
  }

  return {
    brands,
    priceRange: {
      min: priceMin,
      max: priceMax,
      current: {
        min: activeFilters.minPrice ? Number(activeFilters.minPrice) : priceMin,
        max: activeFilters.maxPrice ? Number(activeFilters.maxPrice) : priceMax,
      },
    },
    ratings,
    attributes,
    badges,
    shipping,
  }
}
