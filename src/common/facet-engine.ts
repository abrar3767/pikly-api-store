// Disjunctive faceting — for each facet dimension, counts are calculated
// against the result set with every filter applied EXCEPT that dimension's
// own filter. This way all options stay visible even when one is selected,
// exactly like Amazon / Flipkart / Zalando.

import Fuse from 'fuse.js'

function parseBool(val: any): boolean | null {
  if (val === true || val === 'true' || val === '1') return true
  if (val === false || val === 'false' || val === '0') return false
  return null
}

// Applies every filter in query EXCEPT the one named by `excludeKey`.
function filterWithout(products: any[], query: Record<string, any>, excludeKey: string): any[] {
  let result = [...products]

  if (excludeKey !== 'category' && query.category)
    result = result.filter((p) => p.category === query.category)
  if (excludeKey !== 'subcategory' && query.subcategory)
    result = result.filter((p) => p.subcategory === query.subcategory)
  if (excludeKey !== 'subSubcategory' && query.subSubcategory)
    result = result.filter((p) => p.subSubcategory === query.subSubcategory)

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

  if (excludeKey !== 'discount' && query.discount != null)
    result = result.filter((p) => p.pricing.discountPercent >= Number(query.discount))

  if (excludeKey !== 'color' && query.color) {
    const colors = query.color.split(',').map((c: string) => c.trim().toLowerCase())
    result = result.filter((p) =>
      p.variants?.some((v: any) => colors.includes(v.color?.toLowerCase())),
    )
  }

  if (excludeKey !== 'size' && query.size) {
    const sizes = query.size.split(',').map((s: string) => s.trim().toLowerCase())
    result = result.filter((p) =>
      p.variants?.some((v: any) => sizes.includes(String(v.size ?? '').toLowerCase())),
    )
  }

  if (excludeKey !== 'condition' && query.condition) {
    result = result.filter(
      (p) => (p.condition ?? 'new').toLowerCase() === query.condition.toLowerCase(),
    )
  }

  if (excludeKey !== 'warehouse' && query.warehouse) {
    result = result.filter(
      (p) => p.inventory?.warehouse?.toLowerCase() === query.warehouse.toLowerCase(),
    )
  }

  if (excludeKey !== 'expressAvailable' && query.expressAvailable != null) {
    const val = parseBool(query.expressAvailable)
    if (val !== null) result = result.filter((p) => p.shipping?.expressAvailable === val)
  }

  if (excludeKey !== 'newArrivalDays' && query.newArrivalDays != null) {
    const days = Number(query.newArrivalDays)
    const cutoff = new Date(Date.now() - days * 86_400_000)
    result = result.filter((p) => new Date(p.createdAt) >= cutoff)
  }

  const boolFlags = [
    'featured', 'bestSeller', 'newArrival', 'trending',
    'topRated', 'onSale', 'inStock', 'freeShipping',
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
      const key = pair.slice(0, ci).trim(), value = pair.slice(ci + 1).trim()
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

export function buildFacets(allProducts: any[], activeFilters: Record<string, any>) {

  // ── Brands (disjunctive) ─────────────────────────────────────────────────
  const brandsBase = filterWithout(allProducts, activeFilters, 'brand')
  const brandMap: Record<string, number> = {}
  for (const p of brandsBase) brandMap[p.brand] = (brandMap[p.brand] || 0) + 1
  const activeBrands = activeFilters.brand
    ? activeFilters.brand.split(',').map((b: string) => b.trim().toLowerCase())
    : []
  const brands = Object.entries(brandMap)
    .sort((a, b) => b[1] - a[1])
    .map(([value, count]) => ({
      value, label: value, count,
      selected: activeBrands.includes(value.toLowerCase()),
    }))

  // ── Price range (disjunctive) ────────────────────────────────────────────
  const priceBase = filterWithout(allProducts, activeFilters, 'minPrice')
  const prices = priceBase.map((p) => p.pricing.current)
  const priceMin = prices.length ? Math.floor(Math.min(...prices)) : 0
  const priceMax = prices.length ? Math.ceil(Math.max(...prices)) : 9999

  // ── Ratings (disjunctive) ────────────────────────────────────────────────
  const ratingsBase = filterWithout(allProducts, activeFilters, 'rating')
  const ratings = [4, 3, 2, 1].map((star) => ({
    value: star,
    label: `${star}★ & above`,
    count: ratingsBase.filter((p) => p.ratings.average >= star).length,
    selected: Number(activeFilters.rating) === star,
  }))

  // ── Discount ranges (disjunctive) ────────────────────────────────────────
  const discountBase = filterWithout(allProducts, activeFilters, 'discount')
  const discountRanges = [10, 25, 50, 70].map((pct) => ({
    value: pct,
    label: `${pct}% off or more`,
    count: discountBase.filter((p) => p.pricing.discountPercent >= pct).length,
    selected: Number(activeFilters.discount) === pct,
  }))

  // ── Categories (disjunctive) ─────────────────────────────────────────────
  const categoryBase = filterWithout(allProducts, activeFilters, 'category')
  const categoryMap: Record<string, number> = {}
  for (const p of categoryBase)
    categoryMap[p.category] = (categoryMap[p.category] || 0) + 1
  const categories = Object.entries(categoryMap)
    .sort((a, b) => b[1] - a[1])
    .map(([value, count]) => ({
      value,
      label: value.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
      count,
      selected: activeFilters.category === value,
    }))

  // ── Subcategories (disjunctive) ──────────────────────────────────────────
  const subcategoryBase = filterWithout(allProducts, activeFilters, 'subcategory')
  const subcategoryMap: Record<string, number> = {}
  for (const p of subcategoryBase)
    if (p.subcategory) subcategoryMap[p.subcategory] = (subcategoryMap[p.subcategory] || 0) + 1
  const subcategories = Object.entries(subcategoryMap)
    .sort((a, b) => b[1] - a[1])
    .map(([value, count]) => ({
      value,
      label: value.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
      count,
      selected: activeFilters.subcategory === value,
    }))

  // ── Colors from variants (disjunctive) ───────────────────────────────────
  const colorBase = filterWithout(allProducts, activeFilters, 'color')
  const colorMap: Record<string, { count: number; hex: string }> = {}
  for (const p of colorBase) {
    for (const v of p.variants ?? []) {
      if (!v.color) continue
      if (!colorMap[v.color]) colorMap[v.color] = { count: 0, hex: v.colorHex ?? '#cccccc' }
      colorMap[v.color].count++
    }
  }
  const activeColors = activeFilters.color
    ? activeFilters.color.split(',').map((c: string) => c.trim().toLowerCase())
    : []
  const colors = Object.entries(colorMap)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([value, { count, hex }]) => ({
      value, label: value, count, hex,
      selected: activeColors.includes(value.toLowerCase()),
    }))

  // ── Sizes from variants (disjunctive) ────────────────────────────────────
  const sizeBase = filterWithout(allProducts, activeFilters, 'size')
  const sizeMap: Record<string, number> = {}
  for (const p of sizeBase) {
    for (const v of p.variants ?? []) {
      if (!v.size) continue
      sizeMap[v.size] = (sizeMap[v.size] || 0) + 1
    }
  }
  const activeSizes = activeFilters.size
    ? activeFilters.size.split(',').map((s: string) => s.trim().toLowerCase())
    : []
  const sizes = Object.entries(sizeMap)
    .sort((a, b) => b[1] - a[1])
    .map(([value, count]) => ({
      value, label: value, count,
      selected: activeSizes.includes(value.toLowerCase()),
    }))

  // ── Condition (disjunctive) ───────────────────────────────────────────────
  const conditionBase = filterWithout(allProducts, activeFilters, 'condition')
  const conditionMap: Record<string, number> = {}
  for (const p of conditionBase) {
    const cond = p.condition ?? 'New'
    conditionMap[cond] = (conditionMap[cond] || 0) + 1
  }
  const conditions = Object.entries(conditionMap)
    .sort((a, b) => b[1] - a[1])
    .map(([value, count]) => ({
      value, label: value, count,
      selected: activeFilters.condition === value,
    }))

  // ── Warehouse / Seller (disjunctive) ─────────────────────────────────────
  const warehouseBase = filterWithout(allProducts, activeFilters, 'warehouse')
  const warehouseMap: Record<string, number> = {}
  for (const p of warehouseBase) {
    const wh = p.inventory?.warehouse
    if (wh) warehouseMap[wh] = (warehouseMap[wh] || 0) + 1
  }
  const warehouses = Object.entries(warehouseMap)
    .sort((a, b) => b[1] - a[1])
    .map(([value, count]) => ({
      value, label: value, count,
      selected: activeFilters.warehouse === value,
    }))

  // ── Dynamic attributes (disjunctive) ─────────────────────────────────────
  const attrsBase = filterWithout(allProducts, activeFilters, 'attrs')
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
        activeAttrs[pair.slice(0, ci).trim()] = pair.slice(ci + 1).trim().toLowerCase()
    })
  }
  const attributes: Record<string, any[]> = {}
  for (const [key, vals] of Object.entries(attrMap)) {
    attributes[key] = Object.entries(vals)
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({
        value, count,
        selected: activeAttrs[key] === value.toLowerCase(),
      }))
  }

  // ── Availability ─────────────────────────────────────────────────────────
  const availability = {
    inStock: {
      count: allProducts.filter((p) => p.inventory?.stock > 0).length,
      selected: parseBool(activeFilters.inStock) === true,
    },
    expressDelivery: {
      count: allProducts.filter((p) => p.shipping?.expressAvailable === true).length,
      selected: parseBool(activeFilters.expressAvailable) === true,
    },
  }

  // ── New Arrivals (last 30 / 90 days) ─────────────────────────────────────
  const now = Date.now()
  const newArrivals = {
    last30Days: {
      count: allProducts.filter(
        (p) => new Date(p.createdAt).getTime() >= now - 30 * 86_400_000,
      ).length,
      selected: Number(activeFilters.newArrivalDays) === 30,
    },
    last90Days: {
      count: allProducts.filter(
        (p) => new Date(p.createdAt).getTime() >= now - 90 * 86_400_000,
      ).length,
      selected: Number(activeFilters.newArrivalDays) === 90,
    },
  }

  // ── Badges ───────────────────────────────────────────────────────────────
  const badges = {
    featured:   { count: allProducts.filter((p) => p.featured).length,   selected: parseBool(activeFilters.featured) === true },
    bestSeller: { count: allProducts.filter((p) => p.bestSeller).length, selected: parseBool(activeFilters.bestSeller) === true },
    newArrival: { count: allProducts.filter((p) => p.newArrival).length, selected: parseBool(activeFilters.newArrival) === true },
    trending:   { count: allProducts.filter((p) => p.trending).length,   selected: parseBool(activeFilters.trending) === true },
    topRated:   { count: allProducts.filter((p) => p.topRated).length,   selected: parseBool(activeFilters.topRated) === true },
    onSale:     { count: allProducts.filter((p) => p.onSale).length,     selected: parseBool(activeFilters.onSale) === true },
  }

  // ── Shipping ─────────────────────────────────────────────────────────────
  const shipping = {
    freeShipping: {
      count: allProducts.filter((p) => p.shipping?.freeShipping).length,
      selected: parseBool(activeFilters.freeShipping) === true,
    },
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
    discountRanges,
    categories,
    subcategories,
    colors,
    sizes,
    conditions,
    warehouses,
    attributes,
    availability,
    newArrivals,
    badges,
    shipping,
  }
}