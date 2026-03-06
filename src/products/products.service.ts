import { Injectable, NotFoundException, BadRequestException, OnModuleInit } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model }       from 'mongoose'
import Fuse            from 'fuse.js'
import { filterProducts }    from '../common/filter-engine'
import { buildFacets }       from '../common/facet-engine'
import { smartPaginate }     from '../common/api-utils'
import { CacheService, TTL } from '../common/cache.service'
import { RedisService }      from '../redis/redis.service'
import { FilterProductsDto } from './dto/filter-products.dto'
import { ReviewQueryDto }    from './dto/review-query.dto'
import { SubmitReviewDto }   from './dto/submit-review.dto'
import { Product, ProductDocument } from '../database/product.schema'

@Injectable()
export class ProductsService implements OnModuleInit {
  products: any[] = []

  constructor(
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    private readonly cache: CacheService,
    private readonly redis: RedisService,
  ) {}

  async onModuleInit() {
    await this.loadProducts()
    // PERF-01: subscribe to cross-process invalidation signals via Redis pub/sub.
    // When any process calls invalidate(), it publishes to this channel and all
    // other processes reload their in-memory store — ensuring all pods serve
    // fresh data after an admin mutation.
    this.redis.subscribe('products:invalidate', async () => {
      await this.loadProducts()
    })
  }

  async loadProducts() {
    const docs = await this.productModel.find({}).lean()
    this.products = docs.map(({ _id, __v, ...rest }: any) => rest)
  }

  async invalidate() {
    // PERF-03 fix: flush only product-list cache keys instead of the entire
    // cache. This preserves homepage, banner, and category cache entries that
    // are unrelated to the changed product.
    // Use CacheService's own .keys()/.del() — do NOT access .store which does
    // not exist and caused the selective invalidation to silently no-op before.
    const allKeys = this.cache.keys()
    allKeys.filter((k: string) => k.startsWith('products:')).forEach((k: string) => this.cache.del(k))
    await this.loadProducts()
    // Tell all sibling processes to reload too (PERF-01)
    await this.redis.publish('products:invalidate', Date.now().toString())
  }

  findActiveProducts(): any[] { return this.products.filter(p => p.isActive) }
  findProductById(id: string): any | undefined { return this.products.find(p => p.id === id && p.isActive) }
  findProductBySlug(slug: string): any | undefined { return this.products.find(p => p.slug === slug && p.isActive) }

  // Public live-stock lookup for CartService — avoids the cart accessing the
  // private productModel field directly via 'as any' (which breaks encapsulation
  // and is fragile if the field is renamed or the class is refactored).
  async getLiveProduct(productId: string): Promise<any | null> {
    return this.productModel.findOne({ id: productId, isActive: true }).lean()
  }

  // ── Main product list ──────────────────────────────────────────────────────

  findAll(query: FilterProductsDto) {
    // PERF-02 fix: normalize cache key by sorting query keys alphabetically so
    // ?q=laptop&brand=apple and ?brand=apple&q=laptop produce the same key.
    const sortedQuery = Object.keys(query as any).sort()
      .reduce((acc: any, k) => { acc[k] = (query as any)[k]; return acc }, {})
    const cacheKey = `products:list:${JSON.stringify(sortedQuery)}`

    const cached = this.cache.get<any>(cacheKey)
    if (cached) return { ...cached, meta: { ...cached.meta, cacheHit: true } }

    const active = this.findActiveProducts()

    // BUG-03 fix: run filterProducts ONCE on the untruncated active set to get
    // the full filtered result, then paginate it. Previously filterProducts was
    // called twice — once for pagination and once for facets with limit:99999
    // — which doubled the CPU cost and contradicted the code comment.
    const fullFiltered = filterProducts(active, { ...query, page: 1, limit: 99999 })
    const paginated    = smartPaginate(fullFiltered.items, {
      page: query.page, limit: query.limit ?? 20, cursor: (query as any).cursor,
    })

    const facets = (query as any).includeFacets
      ? buildFacets(fullFiltered.items, query as any)
      : null

    const result = {
      products: paginated.items,
      pagination: {
        total: paginated.total, limit: paginated.limit,
        hasNextPage: paginated.hasNextPage, hasPrevPage: paginated.hasPrevPage,
        mode: paginated.mode,
        ...(paginated.mode==='offset' && { page:(paginated as any).page, totalPages:(paginated as any).totalPages }),
        ...(paginated.mode==='cursor' && { nextCursor:(paginated as any).nextCursor, prevCursor:(paginated as any).prevCursor }),
      },
      facets,
      appliedFilters: fullFiltered.appliedFilters,
      sortOptions:    fullFiltered.sortOptions,
      searchMeta:     fullFiltered.searchMeta,
    }

    this.cache.set(cacheKey, { data: result }, TTL.PRODUCTS)
    return { data: result, cacheHit: false }
  }

  findFeatured()    { return this.findActiveProducts().filter(p => p.featured).sort((a,b) => b.ratings.average-a.ratings.average).slice(0,12) }
  findBestsellers() { return this.findActiveProducts().filter(p => p.bestSeller).sort((a,b) => (b.inventory?.sold??0)-(a.inventory?.sold??0)).slice(0,12) }
  findNewArrivals() { return this.findActiveProducts().filter(p => p.newArrival).sort((a,b) => new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime()).slice(0,12) }
  findTrending()    { return this.findActiveProducts().filter(p => p.trending).slice(0,12) }
  findTopRated()    { return this.findActiveProducts().filter(p => p.topRated).sort((a,b) => b.ratings.average-a.ratings.average).slice(0,12) }
  findOnSale()      { return this.findActiveProducts().filter(p => p.onSale).sort((a,b) => b.pricing.discountPercent-a.pricing.discountPercent).slice(0,12) }

  // BUG-07 fix: use live category slugs instead of a hardcoded list.
  // The CategoriesService reference is injected lazily (passed in) to avoid
  // a circular dependency. Callers pass the live categories array.
  getSuggestions(q: string, liveCategories: any[] = []) {
    if (!q || q.trim().length < 2) return { suggestions: [] }
    const suggestions: any[] = []
    const active = this.findActiveProducts()

    new Fuse(active, { keys:['title','brand','tags'], threshold:0.3, includeScore:true })
      .search(q.trim()).slice(0,3)
      .forEach(({ item }) => suggestions.push({
        type:'product', title:item.title, slug:item.slug,
        image:item.media?.thumb??'', price:item.pricing?.current,
      }))

    // BUG-07 fix: use live category slugs from the database, not a hardcoded array
    const cats = liveCategories.length
      ? liveCategories.map((c: any) => c.slug)
      : ['electronics','fashion','home-kitchen','beauty','sports-fitness','books']
    cats.filter((c: string) => c.toLowerCase().includes(q.toLowerCase())).slice(0,2)
      .forEach((c: string) => suggestions.push({
        type:'category', title:c.replace(/-/g,' ').replace(/\b\w/g, (l: string) => l.toUpperCase()), slug:c,
      }))

    new Fuse([...new Set(active.map(p => p.brand))].map(b => ({ name: b })), { keys:['name'], threshold:0.3 })
      .search(q).slice(0,2)
      .forEach(({ item }) => suggestions.push({
        type:'brand', title:(item as any).name,
        query:`?brand=${encodeURIComponent((item as any).name)}`,
      }))

    suggestions.push({ type:'query', title:`${q} under $500`, query:`?q=${encodeURIComponent(q)}&maxPrice=500` })
    return { suggestions: suggestions.slice(0, 8) }
  }

  findOne(slug: string) {
    const product = this.findProductBySlug(slug)
    if (!product) throw new NotFoundException({ code:'PRODUCT_NOT_FOUND', message:`Product "${slug}" not found` })

    const related = this.findActiveProducts()
      .filter(p => p.subcategory===product.subcategory && p.id!==product.id)
      .sort((a,b) => Math.abs(a.pricing.current-product.pricing.current)-Math.abs(b.pricing.current-product.pricing.current))
      .slice(0,8)
      .map(p => ({ id:p.id,slug:p.slug,title:p.title,brand:p.brand,media:p.media,pricing:p.pricing,ratings:p.ratings,onSale:p.onSale }))

    // SVC-07 note: frequentlyBoughtWith is a deterministic seeded selection —
    // not real co-purchase data. It is stable and cacheable. Real co-purchase
    // data would require order-line-item analysis which is out of scope here.
    const seed = product.id.split('').reduce((acc: number, c: string) => acc + c.charCodeAt(0), 0)
    const frequentlyBoughtWith = this.findActiveProducts()
      .filter(p => p.category !== product.category)
      .sort((a, b) => ((seed + a.id.charCodeAt(0)) % 1000) - ((seed + b.id.charCodeAt(0)) % 1000))
      .slice(0, 4)
      .map(p => ({ id:p.id,slug:p.slug,title:p.title,brand:p.brand,media:p.media,pricing:p.pricing,ratings:p.ratings }))

    const stock = product.inventory?.stock ?? 0
    return {
      ...product, relatedProducts: related, frequentlyBoughtWith,
      stockStatus: stock === 0 ? 'out_of_stock' : stock <= 10 ? 'low_stock' : 'in_stock',
      deliveryEstimate: {
        standard: `${product.shipping?.estimatedDays?.min??3}-${product.shipping?.estimatedDays?.max??7} days`,
        express:  '1-2 days',
      },
    }
  }

  findReviews(slug: string, query: ReviewQueryDto) {
    const product = this.products.find(p => p.slug === slug)
    if (!product) throw new NotFoundException({ code:'PRODUCT_NOT_FOUND', message:`Product "${slug}" not found` })

    let reviews = [...(product.reviews ?? [])]
    if (query.rating)            reviews = reviews.filter(r => r.rating === Number(query.rating))
    if (query.verified === true) reviews = reviews.filter(r => r.verified === true)

    switch (query.sort) {
      case 'helpful':     reviews.sort((a,b) => b.helpful-a.helpful); break
      case 'rating_high': reviews.sort((a,b) => b.rating-a.rating);   break
      case 'rating_low':  reviews.sort((a,b) => a.rating-b.rating);   break
      default:            reviews.sort((a,b) => new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime())
    }

    const paginated = smartPaginate(reviews, { page:query.page, limit:query.limit??10, cursor:query.cursor })
    return {
      reviews: paginated.items,
      pagination: {
        total:paginated.total, limit:paginated.limit,
        hasNextPage:paginated.hasNextPage, hasPrevPage:paginated.hasPrevPage, mode:paginated.mode,
        ...(paginated.mode==='offset' && { page:(paginated as any).page, totalPages:(paginated as any).totalPages }),
        ...(paginated.mode==='cursor' && { nextCursor:(paginated as any).nextCursor, prevCursor:(paginated as any).prevCursor }),
      },
      summary: {
        average:product.ratings.average, total:product.ratings.count,
        distribution:product.ratings.distribution??{},
        verifiedCount:reviews.filter(r=>r.verified).length,
        withImages:reviews.filter(r=>r.images?.length>0).length,
      },
    }
  }

  // FEAT-01: Submit a review (POST /products/:slug/reviews)
  async submitReview(slug: string, userId: string, dto: SubmitReviewDto) {
    const product = await this.productModel.findOne({ slug })
    if (!product) throw new NotFoundException({ code:'PRODUCT_NOT_FOUND', message:`Product "${slug}" not found` })

    const review = {
      id:        `rev_${userId}_${Date.now()}`,
      userId,
      rating:    dto.rating,
      title:     dto.title,
      body:      dto.body,
      verified:  false,
      helpful:   0,
      images:    dto.images ?? [],
      createdAt: new Date().toISOString(),
    }

    await this.productModel.findOneAndUpdate(
      { slug },
      {
        $push: { reviews: { $each: [review], $position: 0 } },
        // Recompute average and count atomically
        $inc:  { 'ratings.count': 1 },
      },
    )

    // Recompute average after save
    const updated = await this.productModel.findOne({ slug }).lean() as any
    if (updated) {
      const total = updated.reviews.reduce((s: number, r: any) => s + r.rating, 0)
      const avg   = parseFloat((total / updated.reviews.length).toFixed(1))
      await this.productModel.findOneAndUpdate({ slug }, { $set: { 'ratings.average': avg } })
    }

    await this.invalidate()
    return review
  }

  // ── Inventory ──────────────────────────────────────────────────────────────

  async decrementStock(productId: string, quantity: number): Promise<boolean> {
    const result = await this.productModel.findOneAndUpdate(
      { id: productId, 'inventory.stock': { $gte: quantity } },
      { $inc: { 'inventory.stock': -quantity, 'inventory.sold': quantity } },
      { new: true },
    )
    if (result) {
      const cached = this.products.find(p => p.id === productId)
      if (cached) { cached.inventory.stock -= quantity; if (cached.inventory.sold !== undefined) cached.inventory.sold += quantity }
    }
    return !!result
  }

  async incrementStock(productId: string, quantity: number): Promise<void> {
    await this.productModel.findOneAndUpdate(
      { id: productId },
      { $inc: { 'inventory.stock': quantity, 'inventory.sold': -quantity } },
    )
    const cached = this.products.find(p => p.id === productId)
    if (cached) { cached.inventory.stock += quantity; if (cached.inventory.sold !== undefined) cached.inventory.sold -= quantity }
  }

  // ── Admin ─────────────────────────────────────────────────────────────────

  async adminFindAll(query: { page?:number; limit?:number; search?:string; isActive?:boolean }) {
    const filter: any = {}
    if (query.isActive !== undefined) filter.isActive = query.isActive
    if (query.search) {
      const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      filter.$or = [{ title:{ $regex:escaped,$options:'i' } }, { brand:{ $regex:escaped,$options:'i' } }]
    }
    const p = Number(query.page??1), l = Number(query.limit??20), skip = (p-1)*l
    const [items, total] = await Promise.all([
      this.productModel.find(filter).skip(skip).limit(l).lean(),
      this.productModel.countDocuments(filter),
    ])
    return { products:items, pagination:{ total,page:p,limit:l,totalPages:Math.ceil(total/l),hasNextPage:p*l<total } }
  }

  async adminCreate(body: any) {
    const existing = await this.productModel.findOne({ $or:[{ id:body.id },{ slug:body.slug }] })
    if (existing) throw new BadRequestException({ code:'DUPLICATE_PRODUCT', message:'A product with this id or slug already exists' })
    const product = await this.productModel.create(body)
    await this.invalidate()
    return product
  }

  async adminUpdate(id: string, body: any) {
    const product = await this.productModel.findOneAndUpdate({ id }, { $set: body }, { new: true })
    if (!product) throw new NotFoundException({ code:'PRODUCT_NOT_FOUND', message:`Product "${id}" not found` })
    await this.invalidate()
    return product
  }

  async adminDelete(id: string) {
    const product = await this.productModel.findOneAndDelete({ id })
    if (!product) throw new NotFoundException({ code:'PRODUCT_NOT_FOUND', message:`Product "${id}" not found` })
    await this.invalidate()
    return { deleted:true, id }
  }
}
