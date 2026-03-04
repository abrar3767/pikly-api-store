export function buildFacets(
  allFilteredProducts: any[],
  activeFilters: Record<string, any>,
) {
  // ── Brands ─────────────────────────────────────────────────────────────────
  const brandMap: Record<string, number> = {}
  for (const p of allFilteredProducts) {
    brandMap[p.brand] = (brandMap[p.brand] || 0) + 1
  }
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

  // ── Price range ────────────────────────────────────────────────────────────
  const prices   = allFilteredProducts.map(p => p.pricing.current)
  const priceMin = prices.length ? Math.floor(Math.min(...prices)) : 0
  const priceMax = prices.length ? Math.ceil(Math.max(...prices))  : 9999

  // ── Ratings ────────────────────────────────────────────────────────────────
  const ratings = [4, 3, 2, 1].map(star => ({
    value: star,
    label: `${star}★ & above`,
    count: allFilteredProducts.filter(p => p.ratings.average >= star).length,
  }))

  // ── Dynamic attributes ─────────────────────────────────────────────────────
  const attrMap: Record<string, Record<string, number>> = {}
  for (const p of allFilteredProducts) {
    if (!p.attributes) continue
    for (const [key, val] of Object.entries(p.attributes)) {
      if (!val || val === 'N/A') continue
      if (Array.isArray(val)) continue        // skip arrays like sizes
      const strVal = String(val)
      if (!attrMap[key]) attrMap[key] = {}
      attrMap[key][strVal] = (attrMap[key][strVal] || 0) + 1
    }
  }

  // Parse active attrs   e.g. "ram:16GB,storage:512GB"
  const activeAttrs: Record<string, string> = {}
  if (activeFilters.attrs) {
    activeFilters.attrs.split(',').forEach((pair: string) => {
      const [k, v] = pair.split(':')
      if (k && v) activeAttrs[k.trim()] = v.trim().toLowerCase()
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

  // ── Badges ─────────────────────────────────────────────────────────────────
  const badges = {
    featured:   { count: allFilteredProducts.filter(p => p.featured).length },
    bestSeller: { count: allFilteredProducts.filter(p => p.bestSeller).length },
    newArrival: { count: allFilteredProducts.filter(p => p.newArrival).length },
    trending:   { count: allFilteredProducts.filter(p => p.trending).length },
    topRated:   { count: allFilteredProducts.filter(p => p.topRated).length },
    onSale:     { count: allFilteredProducts.filter(p => p.onSale).length },
  }

  // ── Shipping ───────────────────────────────────────────────────────────────
  const shipping = {
    freeShipping: { count: allFilteredProducts.filter(p => p.shipping?.freeShipping).length },
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
