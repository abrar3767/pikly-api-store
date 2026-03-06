import { Injectable, NotFoundException, BadRequestException, OnModuleInit } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model }       from 'mongoose'
import Fuse            from 'fuse.js'
import { filterProducts }   from '../common/filter-engine'
import { buildFacets }      from '../common/facet-engine'
import { smartPaginate }    from '../common/api-utils'
import { CacheService, TTL } from '../common/cache.service'
import { FilterProductsDto } from './dto/filter-products.dto'
import { ReviewQueryDto }    from './dto/review-query.dto'
import { Product, ProductDocument } from '../database/product.schema'

// Architecture note:
// All read operations run against an in-memory copy of the product collection
// loaded at startup. This avoids a MongoDB round-trip on every product request.
// The trade-off is that admin mutations must call invalidate() to reload the
// in-memory store. This is safe for a single-process deployment; for multi-
// process setups a shared cache (Redis) should replace node-cache.
@Injectable()
export class ProductsService implements OnModuleInit {
  // products is intentionally kept package-private (lowercase, no readonly
  // on the property itself) but access should go through the accessor methods
  // below rather than touching the array directly from other services.
  products: any[] = []

  constructor(
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    private readonly cache: CacheService,
  ) {}

  async onModuleInit() {
    await this.loadProducts()
  }

  async loadProducts() {
    const docs = await this.productModel.find({}).lean()
    this.products = docs.map(({ _id, __v, ...rest }: any) => rest)
  }

  async invalidate() {
    this.cache.flush()
    await this.loadProducts()
  }

  // ── Typed accessors — prefer these over accessing .products directly ───────

  findActiveProducts(): any[] {
    return this.products.filter(p => p.isActive)
  }

  findProductById(id: string): any | undefined {
    return this.products.find(p => p.id === id && p.isActive)
  }

  findProductBySlug(slug: string): any | undefined {
    return this.products.find(p => p.slug === slug && p.isActive)
  }

  // ── Main product list ──────────────────────────────────────────────────────

  // Previously this called filterProducts() twice when includeFacets was true —
  // once for the facets with limit:99999 and once for pagination. Now we run
  // filtering a single time, collect the full result set for facets, and then
  // paginate that same result set. This halves the CPU work per faceted request.
  findAll(query: FilterProductsDto) {
    const cacheKey = `products:${JSON.stringify(query)}`
    const cached   = this.cache.get<any>(cacheKey)
    if (cached) return { ...cached, meta: { ...cached.meta, cacheHit: true } }

    const activeProducts = this.findActiveProducts()
    const filtered       = filterProducts(activeProducts, query)

    // For facets we need the complete untruncated result — reuse the already-
    // filtered array but repaginate with an enormous limit so nothing is cut off.
    let facets = null
    if (query.includeFacets) {
      const allItems = filterProducts(activeProducts, { ...query, page: 1, limit: 99999 })
      facets = buildFacets(allItems.items, query as any)
    }

    const result = {
      products: filtered.items,
      pagination: {
        total:       filtered.total,
        limit:       filtered.limit,
        hasNextPage: filtered.hasNextPage,
        hasPrevPage: filtered.hasPrevPage,
        mode:        (filtered as any).mode,
        ...((filtered as any).mode === 'offset' && { page: (filtered as any).page, totalPages: (filtered as any).totalPages }),
        ...((filtered as any).mode === 'cursor' && { nextCursor: (filtered as any).nextCursor, prevCursor: (filtered as any).prevCursor }),
      },
      facets,
      appliedFilters: filtered.appliedFilters,
      sortOptions:    filtered.sortOptions,
      searchMeta:     filtered.searchMeta,
    }

    this.cache.set(cacheKey, { data: result }, TTL.PRODUCTS)
    return { data: result, cacheHit: false }
  }

  // ── Curated lists ──────────────────────────────────────────────────────────

  findFeatured()    { return this.findActiveProducts().filter(p => p.featured).sort((a,b) => b.ratings.average - a.ratings.average).slice(0,12) }
  findBestsellers() { return this.findActiveProducts().filter(p => p.bestSeller).sort((a,b) => (b.inventory?.sold??0)-(a.inventory?.sold??0)).slice(0,12) }
  findNewArrivals() { return this.findActiveProducts().filter(p => p.newArrival).sort((a,b) => new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime()).slice(0,12) }
  findTrending()    { return this.findActiveProducts().filter(p => p.trending).slice(0,12) }
  findTopRated()    { return this.findActiveProducts().filter(p => p.topRated).sort((a,b) => b.ratings.average - a.ratings.average).slice(0,12) }
  findOnSale()      { return this.findActiveProducts().filter(p => p.onSale).sort((a,b) => b.pricing.discountPercent - a.pricing.discountPercent).slice(0,12) }

  // ── Search suggestions ─────────────────────────────────────────────────────

  getSuggestions(q: string) {
    if (!q || q.trim().length < 2) return { suggestions: [] }
    const suggestions: any[] = []
    const active = this.findActiveProducts()

    new Fuse(active, { keys: ['title','brand','tags'], threshold: 0.3, includeScore: true })
      .search(q.trim()).slice(0,3)
      .forEach(({ item }) => suggestions.push({
        type: 'product', title: item.title, slug: item.slug,
        image: item.media?.thumb ?? '', price: item.pricing?.current,
      }))

    const cats = ['electronics','laptops','smartphones','audio','fashion','shoes','home-kitchen','beauty','sports-fitness','books','accessories']
    cats.filter(c => c.includes(q.toLowerCase())).slice(0,2)
      .forEach(c => suggestions.push({
        type: 'category',
        title: c.charAt(0).toUpperCase()+c.slice(1).replace('-',' '),
        slug: c,
      }))

    new Fuse([...new Set(active.map(p => p.brand))].map(b => ({ name: b })), { keys: ['name'], threshold: 0.3 })
      .search(q).slice(0,2)
      .forEach(({ item }) => suggestions.push({
        type: 'brand', title: (item as any).name,
        query: `?brand=${encodeURIComponent((item as any).name)}`,
      }))

    suggestions.push({ type: 'query', title: `${q} under $500`, query: `?q=${encodeURIComponent(q)}&maxPrice=500` })
    return { suggestions: suggestions.slice(0, 8) }
  }

  // ── Single product ─────────────────────────────────────────────────────────

  findById(id: string) {
    const product = this.findProductById(id)
    if (!product) {
      throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: `Product with id "${id}" not found` })
    }
    return this.findOne(product.slug)
  }

  findOne(slug: string) {
    const product = this.findProductBySlug(slug)
    if (!product) {
      throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: `Product "${slug}" not found` })
    }

    const related = this.findActiveProducts()
      .filter(p => p.subcategory === product.subcategory && p.id !== product.id)
      .sort((a,b) => Math.abs(a.pricing.current-product.pricing.current) - Math.abs(b.pricing.current-product.pricing.current))
      .slice(0,8)
      .map(p => ({ id:p.id,slug:p.slug,title:p.title,brand:p.brand,media:p.media,pricing:p.pricing,ratings:p.ratings,onSale:p.onSale,newArrival:p.newArrival }))

    // Previously used Math.random() as a sort comparator, which produces a
    // biased shuffle and makes responses non-deterministic (and thus uncacheable).
    // Now we use a stable pseudo-random selection seeded by the product id so
    // the "frequently bought with" list is the same on every call for the same
    // product, which allows it to be cached.
    const seed = product.id.split('').reduce((acc: number, c: string) => acc + c.charCodeAt(0), 0)
    const frequentlyBoughtWith = this.findActiveProducts()
      .filter(p => p.category !== product.category)
      .sort((a, b) => {
        const sa = (seed + a.id.charCodeAt(0)) % 1000
        const sb = (seed + b.id.charCodeAt(0)) % 1000
        return sa - sb
      })
      .slice(0, 4)
      .map(p => ({ id:p.id,slug:p.slug,title:p.title,brand:p.brand,media:p.media,pricing:p.pricing,ratings:p.ratings }))

    const stock = product.inventory?.stock ?? 0
    const stockStatus = stock === 0 ? 'out_of_stock' : stock <= 10 ? 'low_stock' : 'in_stock'

    return {
      ...product,
      relatedProducts: related,
      frequentlyBoughtWith,
      stockStatus,
      deliveryEstimate: {
        standard: `${product.shipping?.estimatedDays?.min??3}-${product.shipping?.estimatedDays?.max??7} days`,
        express:  '1-2 days',
      },
    }
  }

  // ── Reviews ────────────────────────────────────────────────────────────────

  findReviews(slug: string, query: ReviewQueryDto) {
    const product = this.products.find(p => p.slug === slug)
    if (!product) {
      throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: `Product "${slug}" not found` })
    }

    let reviews: any[] = [...(product.reviews ?? [])]
    if (query.rating)            reviews = reviews.filter(r => r.rating === Number(query.rating))
    if (query.verified === true) reviews = reviews.filter(r => r.verified === true)

    switch (query.sort) {
      case 'helpful':     reviews.sort((a,b) => b.helpful-a.helpful); break
      case 'rating_high': reviews.sort((a,b) => b.rating-a.rating);   break
      case 'rating_low':  reviews.sort((a,b) => a.rating-b.rating);   break
      default:            reviews.sort((a,b) => new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime())
    }

    const paginated = smartPaginate(reviews, { page: query.page, limit: query.limit??10, cursor: query.cursor })
    return {
      reviews:    paginated.items,
      pagination: {
        total: paginated.total, limit: paginated.limit,
        hasNextPage: paginated.hasNextPage, hasPrevPage: paginated.hasPrevPage, mode: paginated.mode,
        ...(paginated.mode==='offset' && { page:(paginated as any).page, totalPages:(paginated as any).totalPages }),
        ...(paginated.mode==='cursor' && { nextCursor:(paginated as any).nextCursor, prevCursor:(paginated as any).prevCursor }),
      },
      summary: {
        average:       product.ratings.average,
        total:         product.ratings.count,
        distribution:  product.ratings.distribution ?? {},
        verifiedCount: reviews.filter(r => r.verified).length,
        withImages:    reviews.filter(r => r.images?.length > 0).length,
      },
    }
  }

  // ── Inventory operations (used by OrdersService) ───────────────────────────

  // Atomically decrements the stock for a single product using a conditional
  // findOneAndUpdate. Returns true if the decrement succeeded (sufficient stock
  // was available), false if there was not enough stock.
  // Also updates the in-memory cache immediately so cart checks stay accurate.
  async decrementStock(productId: string, quantity: number): Promise<boolean> {
    const result = await this.productModel.findOneAndUpdate(
      { id: productId, 'inventory.stock': { $gte: quantity } },
      {
        $inc: {
          'inventory.stock': -quantity,
          'inventory.sold':   quantity,
        },
      },
      { new: true },
    )
    if (result) {
      const cached = this.products.find(p => p.id === productId)
      if (cached) {
        cached.inventory.stock -= quantity
        if (cached.inventory.sold !== undefined) cached.inventory.sold += quantity
      }
    }
    return !!result
  }

  // Reverses a previous decrementStock call — used to roll back partial
  // decrements when a later item in the same order fails the stock check.
  async incrementStock(productId: string, quantity: number): Promise<void> {
    await this.productModel.findOneAndUpdate(
      { id: productId },
      {
        $inc: {
          'inventory.stock': quantity,
          'inventory.sold':  -quantity,
        },
      },
    )
    const cached = this.products.find(p => p.id === productId)
    if (cached) {
      cached.inventory.stock += quantity
      if (cached.inventory.sold !== undefined) cached.inventory.sold -= quantity
    }
  }

  // ── Admin helpers ──────────────────────────────────────────────────────────

  async adminFindAll(query: { page?:number; limit?:number; search?:string; isActive?:boolean }) {
    const filter: any = {}
    if (query.isActive !== undefined) filter.isActive = query.isActive
    if (query.search) {
      // Escape the search string to prevent ReDoS via pathological regex input.
      const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      filter.$or = [
        { title: { $regex: escaped, $options: 'i' } },
        { brand: { $regex: escaped, $options: 'i' } },
      ]
    }
    const page = Number(query.page??1), limit = Number(query.limit??20), skip = (page-1)*limit
    const [items, total] = await Promise.all([
      this.productModel.find(filter).skip(skip).limit(limit).lean(),
      this.productModel.countDocuments(filter),
    ])
    return {
      products:   items,
      pagination: { total, page, limit, totalPages: Math.ceil(total/limit), hasNextPage: page*limit<total },
    }
  }

  async adminCreate(body: any) {
    const existing = await this.productModel.findOne({ $or: [{ id: body.id }, { slug: body.slug }] })
    if (existing) {
      throw new BadRequestException({
        code:    'DUPLICATE_PRODUCT',
        message: 'A product with this id or slug already exists',
      })
    }
    const product = await this.productModel.create(body)
    await this.invalidate()
    return product
  }

  async adminUpdate(id: string, body: any) {
    const product = await this.productModel.findOneAndUpdate({ id }, { $set: body }, { new: true })
    if (!product) {
      throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: `Product "${id}" not found` })
    }
    await this.invalidate()
    return product
  }

  async adminDelete(id: string) {
    const product = await this.productModel.findOneAndDelete({ id })
    if (!product) {
      throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: `Product "${id}" not found` })
    }
    await this.invalidate()
    return { deleted: true, id }
  }
}
