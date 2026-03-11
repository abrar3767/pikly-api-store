import { Injectable, NotFoundException, BadRequestException, OnModuleInit, Logger } from '@nestjs/common'
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
  private readonly logger = new Logger(ProductsService.name)

  products: any[] = []

  constructor(
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    private readonly cache: CacheService,
    private readonly redis: RedisService,
  ) {}

  async onModuleInit() {
    await this.loadProducts()
    this.redis.subscribe('products:invalidate', async () => {
      await this.loadProducts()
    })
  }

  async loadProducts() {
    const docs = await this.productModel.find({}).lean()
    this.products = docs.map(({ _id, __v, ...rest }: any) => rest)
    this.logger.log(`Product store loaded: ${this.products.length} products`)
  }

  async invalidate() {
    const allKeys = this.cache.keys()
    allKeys.filter((k: string) => k.startsWith('products:')).forEach((k: string) => this.cache.del(k))
    await this.loadProducts()
    await this.redis.publish('products:invalidate', Date.now().toString())
  }

  findActiveProducts(): any[] { return this.products.filter(p => p.isActive) }
  findProductById(id: string): any | undefined { return this.products.find(p => p.id === id && p.isActive) }
  findProductBySlug(slug: string): any | undefined { return this.products.find(p => p.slug === slug && p.isActive) }

  async getLiveProduct(productId: string): Promise<any | null> {
    return this.productModel.findOne({ id: productId, isActive: true }).lean()
  }

  // ── Main product list ──────────────────────────────────────────────────────

  findAll(query: FilterProductsDto) {
    const sortedQuery = Object.keys(query as any).sort()
      .reduce((acc: any, k) => { acc[k] = (query as any)[k]; return acc }, {})
    const cacheKey = `products:list:${JSON.stringify(sortedQuery)}`

    const cached = this.cache.get<any>(cacheKey)
    if (cached) return { ...cached, meta: { ...cached.meta, cacheHit: true } }

    const active = this.findActiveProducts()

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
        ...(paginated.mode === 'offset' && { page: (paginated as any).page, totalPages: (paginated as any).totalPages }),
        ...(paginated.mode === 'cursor' && { nextCursor: (paginated as any).nextCursor, prevCursor: (paginated as any).prevCursor }),
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

  getSuggestions(q: string, liveCategories: any[] = []) {
    if (!q || q.trim().length < 2) return { suggestions: [] }
    const suggestions: any[] = []
    const active = this.findActiveProducts()

    new Fuse(active, { keys: ['title','brand','tags'], threshold: 0.3, includeScore: true })
      .search(q.trim()).slice(0,3)
      .forEach(({ item }) => suggestions.push({
        type: 'product', title: item.title, slug: item.slug,
        image: item.media?.thumb ?? '', price: item.pricing?.current,
      }))

    const cats = liveCategories.length
      ? liveCategories.map((c: any) => c.slug)
      : ['electronics','fashion','home-kitchen','beauty','sports-fitness','books']
    cats.filter((c: string) => c.toLowerCase().includes(q.toLowerCase())).slice(0,2)
      .forEach((c: string) => suggestions.push({
        type: 'category', title: c.replace(/-/g,' ').replace(/\b\w/g, (l: string) => l.toUpperCase()), slug: c,
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

  findOne(slug: string) {
    const product = this.findProductBySlug(slug)
    if (!product) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: `Product "${slug}" not found` })

    const related = this.findActiveProducts()
      .filter(p => p.subcategory === product.subcategory && p.id !== product.id)
      .sort((a,b) => Math.abs(a.pricing.current-product.pricing.current)-Math.abs(b.pricing.current-product.pricing.current))
      .slice(0,8)
      .map(p => ({ id:p.id,slug:p.slug,title:p.title,brand:p.brand,media:p.media,pricing:p.pricing,ratings:p.ratings,onSale:p.onSale }))

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
    if (!product) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: `Product "${slug}" not found` })

    let reviews = [...(product.reviews ?? [])]
    if (query.rating)            reviews = reviews.filter(r => r.rating === Number(query.rating))
    if (query.verified === true) reviews = reviews.filter(r => r.verified === true)

    switch (query.sort) {
      case 'helpful':     reviews.sort((a,b) => b.helpful-a.helpful); break
      case 'rating_high': reviews.sort((a,b) => b.rating-a.rating);   break
      case 'rating_low':  reviews.sort((a,b) => a.rating-b.rating);   break
      default:            reviews.sort((a,b) => new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime())
    }

    const paginated = smartPaginate(reviews, { page: query.page, limit: query.limit ?? 10, cursor: query.cursor })
    return {
      reviews: paginated.items,
      pagination: {
        total: paginated.total, limit: paginated.limit,
        hasNextPage: paginated.hasNextPage, hasPrevPage: paginated.hasPrevPage, mode: paginated.mode,
        ...(paginated.mode === 'offset' && { page: (paginated as any).page, totalPages: (paginated as any).totalPages }),
        ...(paginated.mode === 'cursor' && { nextCursor: (paginated as any).nextCursor, prevCursor: (paginated as any).prevCursor }),
      },
      summary: {
        average: product.ratings.average, total: product.ratings.count,
        distribution: product.ratings.distribution ?? {},
        verifiedCount: reviews.filter(r => r.verified).length,
        withImages:    reviews.filter(r => r.images?.length > 0).length,
      },
    }
  }

  async submitReview(slug: string, userId: string, dto: SubmitReviewDto) {
    const product = await this.productModel.findOne({ slug })
    if (!product) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: `Product "${slug}" not found` })

    // BUG-01: prevent the same user from submitting multiple reviews for the
    // same product. Without this check, a single user can spam reviews and
    // artificially inflate or tank the product's rating.
    const alreadyReviewed = (product.reviews ?? []).some((r: any) => r.userId === userId)
    if (alreadyReviewed) {
      throw new BadRequestException({
        code:    'ALREADY_REVIEWED',
        message: 'You have already submitted a review for this product.',
      })
    }

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

    // BUG-02: use a single aggregation pipeline update to push the review AND
    // recompute the average atomically in one round-trip. The previous
    // implementation did three separate operations (push → reload → set average),
    // creating a race condition where concurrent reviews could both read the
    // same old average and one review's contribution would be lost permanently.
    //
    // The pipeline: (1) appends the new review to the array, (2) recomputes the
    // average from the final array, (3) sets the new count — all in a single
    // atomic update. MongoDB processes pipeline stages in order within the same
    // operation, so no concurrent write can interleave between stages.
    await this.productModel.updateOne(
      { slug },
      [{
        $set: {
          reviews: { $concatArrays: ['$reviews', [review]] },
          'ratings.count': { $add: ['$ratings.count', 1] },
          'ratings.average': {
            $round: [{
              $divide: [
                {
                  $reduce: {
                    input:        { $concatArrays: ['$reviews', [review]] },
                    initialValue: 0,
                    in:           { $add: ['$$value', '$$this.rating'] },
                  },
                },
                { $add: ['$ratings.count', 1] },
              ],
            }, 1],
          },
        },
      }],
    )

    this.logger.log(`Review submitted: slug=${slug} userId=${userId} rating=${dto.rating}`)
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
      if (cached) {
        cached.inventory.stock -= quantity
        if (cached.inventory.sold !== undefined) cached.inventory.sold += quantity
      }
    }
    if (!result) {
      this.logger.warn(`Stock decrement failed: productId=${productId} requested=${quantity}`)
    }
    return !!result
  }

  async incrementStock(productId: string, quantity: number): Promise<void> {
    await this.productModel.findOneAndUpdate(
      { id: productId },
      { $inc: { 'inventory.stock': quantity, 'inventory.sold': -quantity } },
    )
    const cached = this.products.find(p => p.id === productId)
    if (cached) {
      cached.inventory.stock += quantity
      if (cached.inventory.sold !== undefined) cached.inventory.sold -= quantity
    }
    this.logger.log(`Stock restored: productId=${productId} qty=${quantity}`)
  }

  // ── Admin ─────────────────────────────────────────────────────────────────

  async adminFindAll(query: { page?:number; limit?:number; search?:string; isActive?:boolean }) {
    const filter: any = {}
    if (query.isActive !== undefined) filter.isActive = query.isActive
    if (query.search) {
      const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      filter.$or = [{ title: { $regex: escaped, $options: 'i' } }, { brand: { $regex: escaped, $options: 'i' } }]
    }
    const p = Number(query.page??1), l = Number(query.limit??20), skip = (p-1)*l
    const [items, total] = await Promise.all([
      this.productModel.find(filter).skip(skip).limit(l).lean(),
      this.productModel.countDocuments(filter),
    ])
    return { products: items, pagination: { total, page: p, limit: l, totalPages: Math.ceil(total/l), hasNextPage: p*l<total } }
  }

  async adminCreate(body: any) {
    const existing = await this.productModel.findOne({ $or: [{ id: body.id }, { slug: body.slug }] })
    if (existing) throw new BadRequestException({ code: 'DUPLICATE_PRODUCT', message: 'A product with this id or slug already exists' })
    const product = await this.productModel.create(body)
    await this.invalidate()
    this.logger.log(`Product created: id=${body.id}`)
    return product
  }

  async adminUpdate(id: string, body: any) {
    const product = await this.productModel.findOneAndUpdate({ id }, { $set: body }, { new: true })
    if (!product) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: `Product "${id}" not found` })
    await this.invalidate()
    return product
  }

  async adminDelete(id: string) {
    const product = await this.productModel.findOneAndDelete({ id })
    if (!product) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: `Product "${id}" not found` })
    await this.invalidate()
    this.logger.log(`Product deleted: id=${id}`)
    return { deleted: true, id }
  }
}
