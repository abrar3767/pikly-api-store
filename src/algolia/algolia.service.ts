import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { algoliasearch } from 'algoliasearch'
import type { Algoliasearch } from 'algoliasearch'

@Injectable()
export class AlgoliaService implements OnModuleInit {
  private readonly logger = new Logger(AlgoliaService.name)
  private client: Algoliasearch | null = null
  readonly INDEX_NAME = process.env.ALGOLIA_INDEX ?? 'products'

  async onModuleInit() {
    const appId    = process.env.ALGOLIA_APP_ID
    const writeKey = process.env.ALGOLIA_WRITE_KEY
    if (!appId || !writeKey) { this.logger.warn('Algolia credentials missing'); return }
    try {
      this.client = algoliasearch(appId, writeKey)
      await this.configureIndex()
      this.logger.log(`Algolia ready — index: "${this.INDEX_NAME}"`)
    } catch (err: any) {
      this.logger.error(`Algolia init failed: ${err.message}`)
      this.client = null
    }
  }

  isReady(): boolean { return this.client !== null }

  private async configureIndex() {
    if (!this.client) return
    await this.client.setSettings({
      indexName: this.INDEX_NAME,
      indexSettings: {
        searchableAttributes: ['title', 'brand', 'tags', 'description', 'category', 'subcategory'],
        attributesForFaceting: [
          'searchable(brand)', 'searchable(category)', 'searchable(subcategory)',
          'searchable(colors)', 'searchable(sizes)', 'searchable(condition)', 'searchable(warehouse)',
          'attrValues', 'filterOnly(inStock)', 'filterOnly(freeShipping)',
          'filterOnly(expressAvailable)', 'filterOnly(featured)', 'filterOnly(bestSeller)',
          'filterOnly(newArrival)', 'filterOnly(trending)', 'filterOnly(topRated)', 'filterOnly(onSale)',
        ],
        customRanking: ['desc(avgRating)', 'desc(soldCount)'],
        replicas: [
          `${this.INDEX_NAME}_price_asc`, `${this.INDEX_NAME}_price_desc`,
          `${this.INDEX_NAME}_rating_desc`, `${this.INDEX_NAME}_newest`,
          `${this.INDEX_NAME}_bestselling`, `${this.INDEX_NAME}_discount_desc`,
        ],
      },
    })

    const replicaSettings: Array<[string, string, string]> = [
      [`${this.INDEX_NAME}_price_asc`,     'price',           'asc'],
      [`${this.INDEX_NAME}_price_desc`,    'price',           'desc'],
      [`${this.INDEX_NAME}_rating_desc`,   'avgRating',       'desc'],
      [`${this.INDEX_NAME}_newest`,        'createdAtMs',     'desc'],
      [`${this.INDEX_NAME}_bestselling`,   'soldCount',       'desc'],
      [`${this.INDEX_NAME}_discount_desc`, 'discountPercent', 'desc'],
    ]
    await Promise.allSettled(
      replicaSettings.map(([name, field, dir]) =>
        this.client!.setSettings({
          indexName: name,
          indexSettings: {
            ranking: [`${dir}(${field})`, 'typo', 'geo', 'words', 'filters', 'proximity', 'attribute', 'exact', 'custom'],
          },
        }),
      ),
    )
  }

  // ── Record conversion ─────────────────────────────────────────────────────

  toRecord(product: any): Record<string, any> {
    const attrValues: string[] = []
    if (product.attributes && typeof product.attributes === 'object') {
      for (const [k, v] of Object.entries(product.attributes)) {
        if (v && v !== 'N/A' && !Array.isArray(v)) attrValues.push(`${k}:${String(v)}`)
      }
    }
    const colorMap: Record<string, string> = {}
    const sizes: string[] = []
    for (const v of product.variants ?? []) {
      if (v.color) colorMap[v.color] = v.colorHex ?? '#cccccc'
      if (v.size) sizes.push(String(v.size))
    }
    return {
      objectID: product.id, id: product.id, slug: product.slug,
      title: product.title ?? '', brand: product.brand ?? '',
      category: product.category ?? '', subcategory: product.subcategory ?? '',
      subSubcategory: product.subSubcategory ?? '',
      description: product.description ?? '', tags: product.tags ?? [],
      price: product.pricing?.current ?? 0, originalPrice: product.pricing?.original ?? 0,
      discountPercent: product.pricing?.discountPercent ?? 0, currency: product.pricing?.currency ?? 'USD',
      avgRating: product.ratings?.average ?? 0, ratingCount: product.ratings?.count ?? 0,
      stock: product.inventory?.stock ?? 0, soldCount: product.inventory?.sold ?? 0,
      warehouse: product.inventory?.warehouse ?? '', inStock: (product.inventory?.stock ?? 0) > 0,
      freeShipping: product.shipping?.freeShipping ?? false,
      expressAvailable: product.shipping?.expressAvailable ?? false,
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

  // ── Sync ──────────────────────────────────────────────────────────────────

  async syncAll(products: any[]): Promise<void> {
    if (!this.client) return
    const objects = products.map((p) => this.toRecord(p))
    const CHUNK = 1000
    for (let i = 0; i < objects.length; i += CHUNK) {
      await this.client.saveObjects({ indexName: this.INDEX_NAME, objects: objects.slice(i, i + CHUNK) })
    }
    this.logger.log(`Algolia synced: ${objects.length} products`)
  }

  async syncOne(product: any): Promise<void> {
    if (!this.client) return
    await this.client.saveObjects({ indexName: this.INDEX_NAME, objects: [this.toRecord(product)] })
  }

  async deleteOne(productId: string): Promise<void> {
    if (!this.client) return
    await this.client.deleteObject({ indexName: this.INDEX_NAME, objectID: productId })
  }

  // ── Filter string builder ─────────────────────────────────────────────────

  buildFilters(query: Record<string, any>, excludeKey?: string): string {
    const parts: string[] = []
    if (excludeKey !== 'brand' && query.brand)
      parts.push(`(${query.brand.split(',').map((b: string) => `brand:"${b.trim()}"`).join(' OR ')})`)
    if (excludeKey !== 'category'    && query.category)    parts.push(`category:"${query.category}"`)
    if (excludeKey !== 'subcategory' && query.subcategory) parts.push(`subcategory:"${query.subcategory}"`)
    if (excludeKey !== 'minPrice'    && query.minPrice != null) parts.push(`price >= ${Number(query.minPrice)}`)
    if (excludeKey !== 'maxPrice'    && query.maxPrice != null) parts.push(`price <= ${Number(query.maxPrice)}`)
    if (excludeKey !== 'rating'      && query.rating != null)   parts.push(`avgRating >= ${Number(query.rating)}`)
    if (excludeKey !== 'discount'    && query.discount != null) parts.push(`discountPercent >= ${Number(query.discount)}`)
    if (excludeKey !== 'color' && query.color)
      parts.push(`(${query.color.split(',').map((c: string) => `colors:"${c.trim()}"`).join(' OR ')})`)
    if (excludeKey !== 'size' && query.size)
      parts.push(`(${query.size.split(',').map((s: string) => `sizes:"${s.trim()}"`).join(' OR ')})`)
    if (excludeKey !== 'condition' && query.condition) parts.push(`condition:"${query.condition}"`)
    if (excludeKey !== 'warehouse' && query.warehouse) parts.push(`warehouse:"${query.warehouse}"`)
    if (excludeKey !== 'attrs' && query.attrs) {
      for (const pair of query.attrs.split(',').map((a: string) => a.trim())) {
        const ci = pair.indexOf(':')
        if (ci !== -1) {
          const k = pair.slice(0, ci).trim(), v = pair.slice(ci + 1).trim()
          if (k && v) parts.push(`attrValues:"${k}:${v}"`)
        }
      }
    }
    const boolMap: Record<string, string> = {
      inStock: 'inStock', freeShipping: 'freeShipping', expressAvailable: 'expressAvailable',
      featured: 'featured', bestSeller: 'bestSeller', newArrival: 'newArrival',
      trending: 'trending', topRated: 'topRated', onSale: 'onSale',
    }
    for (const [qk, rk] of Object.entries(boolMap)) {
      if (excludeKey !== qk && (query[qk] === true || query[qk] === 'true' || query[qk] === '1'))
        parts.push(`${rk}:true`)
    }
    if (excludeKey !== 'newArrivalDays' && query.newArrivalDays != null)
      parts.push(`createdAtMs >= ${Date.now() - Number(query.newArrivalDays) * 86_400_000}`)
    return parts.join(' AND ')
  }

  private getIndexForSort(sort?: string): string {
    const map: Record<string, string> = {
      price_asc:     `${this.INDEX_NAME}_price_asc`,
      price_desc:    `${this.INDEX_NAME}_price_desc`,
      rating_desc:   `${this.INDEX_NAME}_rating_desc`,
      newest:        `${this.INDEX_NAME}_newest`,
      bestselling:   `${this.INDEX_NAME}_bestselling`,
      discount_desc: `${this.INDEX_NAME}_discount_desc`,
    }
    return map[sort ?? ''] ?? this.INDEX_NAME
  }

  // ── Facet response builder ────────────────────────────────────────────────

  buildFacetsResponse(
    mainFacets: Record<string, Record<string, number>>,
    disjFacets: Record<string, Record<string, number>>,
    allProducts: any[],
    query: Record<string, any>,
  ) {
    const counts = (dim: string) => disjFacets[dim] ?? mainFacets[dim] ?? {}

    const activeBrands = query.brand ? query.brand.split(',').map((b: string) => b.trim().toLowerCase()) : []
    const brands = Object.entries(counts('brand')).sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, label: value, count, selected: activeBrands.includes(value.toLowerCase()) }))

    const categories = Object.entries(counts('category')).sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, label: value.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()), count, selected: query.category === value }))

    const subcategories = Object.entries(counts('subcategory')).sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, label: value.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()), count, selected: query.subcategory === value }))

    const hexMap: Record<string, string> = {}
    for (const p of allProducts) for (const v of p.variants ?? []) if (v.color && v.colorHex) hexMap[v.color] = v.colorHex
    const activeColors = query.color ? query.color.split(',').map((c: string) => c.trim().toLowerCase()) : []
    const colors = Object.entries(counts('colors')).sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, label: value, count, hex: hexMap[value] ?? '#cccccc', selected: activeColors.includes(value.toLowerCase()) }))

    const activeSizes = query.size ? query.size.split(',').map((s: string) => s.trim().toLowerCase()) : []
    const sizes = Object.entries(counts('sizes')).sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, label: value, count, selected: activeSizes.includes(value.toLowerCase()) }))

    const conditions = Object.entries(counts('condition')).sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, label: value, count, selected: query.condition === value }))

    const warehouses = Object.entries(counts('warehouse')).sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, label: value, count, selected: query.warehouse === value }))

    const activeAttrs: Record<string, string> = {}
    if (query.attrs) query.attrs.split(',').forEach((pair: string) => {
      const ci = pair.indexOf(':')
      if (ci !== -1) activeAttrs[pair.slice(0, ci).trim()] = pair.slice(ci + 1).trim().toLowerCase()
    })
    const attrMap: Record<string, { value: string; count: number; selected: boolean }[]> = {}
    for (const [kv, count] of Object.entries(counts('attrValues'))) {
      const ci = kv.indexOf(':')
      if (ci === -1) continue
      const key = kv.slice(0, ci), value = kv.slice(ci + 1)
      if (!attrMap[key]) attrMap[key] = []
      attrMap[key].push({ value, count, selected: activeAttrs[key] === value.toLowerCase() })
    }
    for (const key of Object.keys(attrMap)) attrMap[key].sort((a, b) => b.count - a.count)

    const prices = allProducts.map((p) => p.pricing?.current ?? 0)
    const priceMin = prices.length ? Math.floor(Math.min(...prices)) : 0
    const priceMax = prices.length ? Math.ceil(Math.max(...prices)) : 9999

    const ratings = [4, 3, 2, 1].map((star) => ({
      value: star, label: `${star}★ & above`,
      count: allProducts.filter((p) => p.ratings?.average >= star).length,
      selected: Number(query.rating) === star,
    }))

    const discountRanges = [10, 25, 50, 70].map((pct) => ({
      value: pct, label: `${pct}% off or more`,
      count: allProducts.filter((p) => p.pricing?.discountPercent >= pct).length,
      selected: Number(query.discount) === pct,
    }))

    const now = Date.now()
    const availability = {
      inStock:         { count: allProducts.filter((p) => p.inventory?.stock > 0).length,                selected: query.inStock         === true || query.inStock         === 'true' },
      expressDelivery: { count: allProducts.filter((p) => p.shipping?.expressAvailable === true).length, selected: query.expressAvailable === true || query.expressAvailable === 'true' },
    }
    const newArrivals = {
      last30Days: { count: allProducts.filter((p) => new Date(p.createdAt).getTime() >= now - 30 * 86_400_000).length, selected: Number(query.newArrivalDays) === 30 },
      last90Days: { count: allProducts.filter((p) => new Date(p.createdAt).getTime() >= now - 90 * 86_400_000).length, selected: Number(query.newArrivalDays) === 90 },
    }
    const badges = {
      featured:   { count: allProducts.filter((p) => p.featured).length,   selected: query.featured   === true || query.featured   === 'true' },
      bestSeller: { count: allProducts.filter((p) => p.bestSeller).length, selected: query.bestSeller === true || query.bestSeller === 'true' },
      newArrival: { count: allProducts.filter((p) => p.newArrival).length, selected: query.newArrival === true || query.newArrival === 'true' },
      trending:   { count: allProducts.filter((p) => p.trending).length,   selected: query.trending   === true || query.trending   === 'true' },
      topRated:   { count: allProducts.filter((p) => p.topRated).length,   selected: query.topRated   === true || query.topRated   === 'true' },
      onSale:     { count: allProducts.filter((p) => p.onSale).length,     selected: query.onSale     === true || query.onSale     === 'true' },
    }
    const shipping = {
      freeShipping: { count: allProducts.filter((p) => p.shipping?.freeShipping).length, selected: query.freeShipping === true || query.freeShipping === 'true' },
    }

    return {
      brands,
      priceRange: {
        min: priceMin, max: priceMax,
        current: { min: query.minPrice ? Number(query.minPrice) : priceMin, max: query.maxPrice ? Number(query.maxPrice) : priceMax },
      },
      ratings, discountRanges, categories, subcategories, colors, sizes,
      conditions, warehouses, attributes: attrMap, availability, newArrivals, badges, shipping,
    }
  }

  // ── Main search ───────────────────────────────────────────────────────────

  async fullSearch(query: Record<string, any>, allProducts: any[]): Promise<{ data: any; cacheHit: false }> {
    if (!this.client) throw new Error('Algolia not initialised')

    const indexName   = this.getIndexForSort(query.sort)
    const baseFilters = this.buildFilters(query)
    const searchQuery = String(query.q ?? '')
    const hitsPerPage = Math.min(Number(query.limit ?? 20), 100)
    const page        = Math.max(0, Number(query.page ?? 1) - 1)

    const disjDimensions = ['brand', 'category', 'subcategory', 'color', 'size', 'condition', 'warehouse', 'attrs']

    // Build requests array for v5 client.search()
    const requests: any[] = [{
      indexName,
      query: searchQuery,
      filters: baseFilters,
      facets: ['brand', 'category', 'subcategory', 'colors', 'sizes', 'condition', 'warehouse', 'attrValues'],
      page,
      hitsPerPage,
      attributesToRetrieve: ['*'],
      typoTolerance: true,
    }]

    const activeDimensions: string[] = []
    for (const dim of disjDimensions) {
      const qKey = dim === 'color' ? 'color' : dim === 'size' ? 'size' : dim
      if (query[qKey]) {
        activeDimensions.push(dim)
        const algoliaKey = dim === 'color' ? 'colors' : dim === 'size' ? 'sizes' : dim === 'attrs' ? 'attrValues' : dim
        requests.push({
          indexName,
          query: searchQuery,
          filters: this.buildFilters(query, dim),
          facets: [algoliaKey],
          page: 0,
          hitsPerPage: 0,
        })
      }
    }

    // v5: client.search({ requests })
    const results     = await this.client.search({ requests })
    const mainResult  = results.results[0] as any
    const disjResults = results.results.slice(1) as any[]

    const disjFacets: Record<string, Record<string, number>> = {}
    for (let i = 0; i < activeDimensions.length; i++) {
      const dim = activeDimensions[i]
      const algoliaKey = dim === 'color' ? 'colors' : dim === 'size' ? 'sizes' : dim === 'attrs' ? 'attrValues' : dim
      if (disjResults[i]?.facets?.[algoliaKey]) disjFacets[algoliaKey] = disjResults[i].facets[algoliaKey]
    }

    // Applied filters
    const appliedFilters: any[] = []
    if (query.q)           appliedFilters.push({ key: 'q',           value: query.q,           label: `Search: ${query.q}` })
    if (query.category)    appliedFilters.push({ key: 'category',    value: query.category,    label: `Category: ${query.category}` })
    if (query.subcategory) appliedFilters.push({ key: 'subcategory', value: query.subcategory, label: `Subcategory: ${query.subcategory}` })
    if (query.brand) query.brand.split(',').forEach((b: string) => appliedFilters.push({ key: 'brand', value: b.trim(), label: `Brand: ${b.trim()}` }))
    if (query.minPrice) appliedFilters.push({ key: 'minPrice', value: query.minPrice, label: `Min: $${query.minPrice}` })
    if (query.maxPrice) appliedFilters.push({ key: 'maxPrice', value: query.maxPrice, label: `Max: $${query.maxPrice}` })
    if (query.rating)   appliedFilters.push({ key: 'rating',   value: query.rating,   label: `${query.rating}★+` })
    if (query.color)    appliedFilters.push({ key: 'color',    value: query.color,    label: `Color: ${query.color}` })
    if (query.size)     appliedFilters.push({ key: 'size',     value: query.size,     label: `Size: ${query.size}` })
    if (query.attrs) query.attrs.split(',').forEach((pair: string) => {
      const ci = pair.indexOf(':')
      if (ci !== -1) { const k = pair.slice(0, ci).trim(), v = pair.slice(ci + 1).trim(); if (k && v) appliedFilters.push({ key: k, value: v, label: `${k}: ${v}` }) }
    })

    const totalHits   = mainResult.nbHits  ?? 0
    const totalPages  = mainResult.nbPages ?? 1
    const currentPage = (mainResult.page   ?? 0) + 1

    const products = (mainResult.hits ?? []).map((hit: any) => {
      const { objectID, _highlightResult, _rankingInfo, ...rest } = hit
      return rest
    })

    const facets = query.includeFacets
      ? this.buildFacetsResponse(mainResult.facets ?? {}, disjFacets, allProducts, query)
      : null

    return {
      data: {
        products,
        pagination: { total: totalHits, limit: hitsPerPage, page: currentPage, totalPages, hasNextPage: currentPage < totalPages, hasPrevPage: currentPage > 1, mode: 'offset' },
        facets, appliedFilters,
        sortOptions: [
          { value: 'relevance',     label: 'Most Relevant' },
          { value: 'price_asc',     label: 'Price: Low to High' },
          { value: 'price_desc',    label: 'Price: High to Low' },
          { value: 'rating_desc',   label: 'Top Rated' },
          { value: 'newest',        label: 'Newest First' },
          { value: 'bestselling',   label: 'Best Selling' },
          { value: 'discount_desc', label: 'Biggest Discount' },
        ],
        searchMeta: { query: query.q ?? null, totalResults: totalHits, searchTime: `${mainResult.processingTimeMS ?? 0}ms`, engine: 'algolia', paginationMode: 'offset' },
      },
      cacheHit: false,
    }
  }
}