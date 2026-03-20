import {
  Injectable,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
  Logger,
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import Fuse from 'fuse.js'
import { smartPaginate } from '../common/api-utils'
import { CacheService, TTL } from '../common/cache.service'
import { RedisService } from '../redis/redis.service'
import { AlgoliaService } from '../algolia/algolia.service'
import { FilterProductsDto } from './dto/filter-products.dto'
import { ReviewQueryDto } from './dto/review-query.dto'
import { SubmitReviewDto } from './dto/submit-review.dto'
import { AdminCreateProductDto } from './dto/admin-create-product.dto'
import { AdminUpdateProductDto } from './dto/admin-update-product.dto'
import { Product, ProductDocument } from '../database/product.schema'

@Injectable()
export class ProductsService implements OnModuleInit {
  private readonly logger = new Logger(ProductsService.name)

  products:         Product[] = []
  cachedCategories: any[]    = []   // set by AppModule/CategoriesService after init

  constructor(
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    private readonly cache: CacheService,
    private readonly redis: RedisService,
    private readonly algolia: AlgoliaService,
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

    if (this.algolia.isReady()) {
      this.algolia
        .syncAll(this.products.filter((p: any) => p.isActive))
        .catch((err) => this.logger.error(`Algolia background sync failed: ${err.message}`))
    }
  }

  async invalidate() {
    const allKeys = this.cache.keys()
    allKeys
      .filter((k: string) => k.startsWith('products:'))
      .forEach((k: string) => this.cache.del(k))
    await this.loadProducts()
    await this.redis.publish('products:invalidate', Date.now().toString())
  }

  findActiveProducts(): any[] {
    return this.products.filter((p: any) => p.isActive)
  }

  // ── In-memory lookups (used by other services & curated lists) ─────────────

  findProductById(id: string): any | undefined {
    return this.products.find((p) => p.id === id && (p as any).isActive)
  }

  findProductBySlug(slug: string): any | undefined {
    return this.products.find((p) => p.slug === slug && (p as any).isActive)
  }

  findProductByAsin(asin: string): any | undefined {
    return this.products.find((p) => (p as any).asin === asin && (p as any).isActive)
  }

  async getLiveProduct(productId: string): Promise<Product | null> {
    return this.productModel.findOne({ id: productId, isActive: true }).lean()
  }

  // ── Main product list ──────────────────────────────────────────────────────

  async findAll(query: FilterProductsDto): Promise<{ data: any; cacheHit: boolean }> {
    const sortedQuery = Object.keys(query as any)
      .sort()
      .reduce((acc: any, k) => { acc[k] = (query as any)[k]; return acc }, {})
    // ── NO CACHING for search results ────────────────────────────────────────
    // Algolia is already extremely fast (1-5ms).
    // Caching caused "sometimes correct, sometimes wrong" because stale
    // cached results were served instead of fresh Algolia data.
    // Algolia has its own internal caching — we don't need to double-cache.
    const result = await this.algolia.fullSearch(query as any, this.findActiveProducts(), this.cachedCategories)
    return { data: result.data, cacheHit: false }
  }

  // ── Curated lists — use new schema flat fields ────────────────────────────

  findFeatured() {
    return this.findActiveProducts()
      .filter((p) => (p as any).featured)
      .sort((a, b) => ((b as any).avgRating ?? (b as any).ratings?.average ?? 0) - ((a as any).avgRating ?? (a as any).ratings?.average ?? 0))
      .slice(0, 12)
  }

  findBestsellers() {
    return this.findActiveProducts()
      .filter((p) => (p as any).bestSeller)
      .sort((a, b) => ((b as any).soldCount ?? (b as any).inventory?.sold ?? 0) - ((a as any).soldCount ?? (a as any).inventory?.sold ?? 0))
      .slice(0, 12)
  }

  findNewArrivals() {
    return this.findActiveProducts()
      .filter((p) => (p as any).newArrival)
      .sort((a, b) => ((b as any).createdAtMs ?? 0) - ((a as any).createdAtMs ?? 0))
      .slice(0, 12)
  }

  findTrending() {
    return this.findActiveProducts()
      .filter((p) => (p as any).trending)
      .sort((a, b) => ((b as any).soldCount ?? 0) - ((a as any).soldCount ?? 0))
      .slice(0, 12)
  }

  findTopRated() {
    return this.findActiveProducts()
      .filter((p) => (p as any).topRated)
      .sort((a, b) => ((b as any).avgRating ?? (b as any).ratings?.average ?? 0) - ((a as any).avgRating ?? (a as any).ratings?.average ?? 0))
      .slice(0, 12)
  }

  findOnSale() {
    return this.findActiveProducts()
      .filter((p) => (p as any).onSale)
      .sort((a, b) => ((b as any).discountPercent ?? (b as any).pricing?.discountPercent ?? 0) - ((a as any).discountPercent ?? (a as any).pricing?.discountPercent ?? 0))
      .slice(0, 12)
  }

  // ── Search suggestions ─────────────────────────────────────────────────────

  getSuggestions(q: string, liveCategories: any[] = []) {
    // Delegate to AlgoliaService — Algolia-powered with Fuse.js fallback
    return this.algolia.getSuggestions(q, liveCategories, this.findActiveProducts())
  }


  // ── Single product ─────────────────────────────────────────────────────────
  // Accepts: slug (always), asin (B0XXXXXXXXX), or internal id (prod_XXXX)

  findOne(slugOrAsinOrId: string) {
    // Try slug first (most common), then asin, then internal id
    const product =
      this.findProductBySlug(slugOrAsinOrId) ??
      this.findProductByAsin(slugOrAsinOrId) ??
      this.findProductById(slugOrAsinOrId)

    if (!product)
      throw new NotFoundException({
        code: 'PRODUCT_NOT_FOUND',
        message: `Product "${slugOrAsinOrId}" not found`,
      })

    const p = product as any

    // ── Related products — same subcategory, price-similar ─────────────────
    const relatedProducts = this.findActiveProducts()
      .filter((r: any) => r.subcategory === p.subcategory && r.id !== p.id)
      .sort((a: any, b: any) =>
        Math.abs((a.price ?? a.pricing?.current ?? 0) - (p.price ?? p.pricing?.current ?? 0)) -
        Math.abs((b.price ?? b.pricing?.current ?? 0) - (p.price ?? p.pricing?.current ?? 0)),
      )
      .slice(0, 8)
      .map((r: any) => ({
        id:       r.id,
        slug:     r.slug,
        asin:     r.asin ?? null,
        title:    r.title,
        brand:    r.brand,
        image:    r.media?.mainImage ?? r.media?.images?.[0]?.url ?? '',
        price:    r.price           ?? r.pricing?.current      ?? null,
        original: r.pricing?.original ?? null,
        discount: r.discountPercent  ?? r.pricing?.discountPercent ?? 0,
        rating:   r.avgRating        ?? r.ratings?.average     ?? null,
        reviews:  r.ratings?.total   ?? r.ratings?.count       ?? 0,
        isPrime:  r.isPrime ?? false,
        onSale:   r.onSale  ?? false,
        badges:   r.badges  ?? null,
      }))

    // ── Frequently bought with — different category ────────────────────────
    const seed = p.id.split('').reduce((acc: number, c: string) => acc + c.charCodeAt(0), 0)
    const frequentlyBoughtWith = this.findActiveProducts()
      .filter((r: any) => r.category !== p.category)
      .sort((a: any, b: any) => ((seed + a.id.charCodeAt(0)) % 1000) - ((seed + b.id.charCodeAt(0)) % 1000))
      .slice(0, 4)
      .map((r: any) => ({
        id:      r.id,
        slug:    r.slug,
        asin:    r.asin ?? null,
        title:   r.title,
        brand:   r.brand,
        image:   r.media?.mainImage ?? r.media?.images?.[0]?.url ?? '',
        price:   r.price  ?? r.pricing?.current ?? null,
        rating:  r.avgRating ?? r.ratings?.average ?? null,
        isPrime: r.isPrime ?? false,
      }))

    // ── Stock status — use new availability field ───────────────────────────
    const stockLevel = p.availability?.stockLevel ?? p.inventory?.stock ?? 0
    const stockStatus =
      p.availability?.status ??
      (stockLevel === 0 ? 'out_of_stock' : stockLevel <= 5 ? 'limited' : 'in_stock')

    // ── Delivery estimate ──────────────────────────────────────────────────
    const deliveryEstimate = {
      standard: p.delivery?.standardDelivery?.date ?? '3-7 business days',
      fastest:  p.delivery?.fastestDelivery?.date  ?? '1-2 business days',
      isPrime:  p.isPrime ?? p.delivery?.isPrime   ?? false,
      isFree:   p.freeShipping ?? p.delivery?.isFreeShipping ?? false,
      soldBy:   p.delivery?.soldBy ?? 'Amazon',
      fulfilledBy: p.delivery?.fulfilledBy ?? 'Amazon',
    }

    return {
      ...product,
      // Ensure these computed/alias fields are always present
      mainImage:             p.media?.mainImage ?? p.media?.images?.[0]?.url ?? '',
      price:                 p.price  ?? p.pricing?.current  ?? null,
      originalPrice:         p.pricing?.original             ?? null,
      discountPercent:       p.discountPercent ?? p.pricing?.discountPercent ?? 0,
      avgRating:             p.avgRating ?? p.ratings?.average ?? null,
      ratingTotal:           p.ratings?.total ?? p.ratings?.count ?? 0,
      stockStatus,
      stockLevel,
      deliveryEstimate,
      relatedProducts,
      frequentlyBoughtWith,
    }
  }

  // ── Reviews ────────────────────────────────────────────────────────────────

  findReviews(slug: string, query: ReviewQueryDto) {
    // Accept slug or asin
    const product =
      this.products.find((p) => (p as any).slug === slug) ??
      this.products.find((p) => (p as any).asin === slug)

    if (!product)
      throw new NotFoundException({
        code: 'PRODUCT_NOT_FOUND',
        message: `Product "${slug}" not found`,
      })

    const p = product as any
    let reviews = [...(p.reviews ?? [])]

    if (query.rating)            reviews = reviews.filter((r) => r.rating === Number(query.rating))
    if (query.verified === true)  reviews = reviews.filter((r) => r.verified === true)

    switch (query.sort) {
      case 'helpful':     reviews.sort((a, b) => (b.helpfulVotes ?? b.helpful ?? 0) - (a.helpfulVotes ?? a.helpful ?? 0)); break
      case 'rating_high': reviews.sort((a, b) => b.rating  - a.rating);  break
      case 'rating_low':  reviews.sort((a, b) => a.rating  - b.rating);  break
      default:
        reviews.sort((a, b) => new Date(b.date ?? b.createdAt ?? 0).getTime() - new Date(a.date ?? a.createdAt ?? 0).getTime())
    }

    const paginated = smartPaginate(reviews, {
      page: query.page, limit: query.limit ?? 10, cursor: query.cursor,
    })

    return {
      reviews: paginated.items,
      pagination: {
        total: paginated.total, limit: paginated.limit,
        hasNextPage: paginated.hasNextPage, hasPrevPage: paginated.hasPrevPage,
        mode: paginated.mode,
        ...(paginated.mode === 'offset' && { page: (paginated as any).page, totalPages: (paginated as any).totalPages }),
        ...(paginated.mode === 'cursor' && { nextCursor: (paginated as any).nextCursor, prevCursor: (paginated as any).prevCursor }),
      },
      summary: {
        average:       p.ratings?.average    ?? p.avgRating ?? 0,
        total:         p.ratings?.total      ?? p.ratings?.count ?? 0,
        breakdown:     p.ratings?.breakdown  ?? {},
        verifiedCount: reviews.filter((r) => r.verified).length,
        withImages:    reviews.filter((r) => r.images?.length > 0).length,
      },
    }
  }

  async submitReview(slug: string, userId: string, dto: SubmitReviewDto) {
    // Accept slug or asin
    const product = await this.productModel.findOne({
      $or: [{ slug }, { asin: slug }],
    })
    if (!product)
      throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: `Product "${slug}" not found` })

    const alreadyReviewed = (product.reviews ?? []).some((r: any) => r.userId === userId)
    if (alreadyReviewed)
      throw new BadRequestException({
        code: 'ALREADY_REVIEWED',
        message: 'You have already submitted a review for this product.',
      })

    const review = {
      id:           `rev_${userId}_${Date.now()}`,
      userId,
      rating:       dto.rating,
      title:        dto.title,
      body:         dto.body,
      verified:     false,
      helpfulVotes: 0,
      images:       (dto as any).images ?? [],
      date:         new Date().toISOString().split('T')[0],
      reviewer:     `User_${userId.slice(-4)}`,
    }

    await this.productModel.updateOne({ _id: product._id }, [
      {
        $set: {
          reviews:           { $concatArrays: ['$reviews', [review]] },
          'ratings.total':   { $add: ['$ratings.total', 1] },
          'ratings.average': {
            $round: [{
              $divide: [{
                $reduce: {
                  input:        { $concatArrays: ['$reviews', [review]] },
                  initialValue: 0,
                  in:           { $add: ['$$value', '$$this.rating'] },
                },
              }, { $add: ['$ratings.total', 1] }],
            }, 1],
          },
          // Keep flat avgRating in sync
          avgRating: {
            $round: [{
              $divide: [{
                $reduce: {
                  input:        { $concatArrays: ['$reviews', [review]] },
                  initialValue: 0,
                  in:           { $add: ['$$value', '$$this.rating'] },
                },
              }, { $add: ['$ratings.total', 1] }],
            }, 1],
          },
        },
      },
    ])

    this.logger.log(`Review submitted: slug=${product.slug} userId=${userId} rating=${dto.rating}`)
    await this.invalidate()
    return review
  }

  // ── Inventory (called by orders service) ──────────────────────────────────

  async decrementStock(productId: string, quantity: number): Promise<boolean> {
    // Decrement both inventory.stock and availability.stockLevel
    const result = await this.productModel.findOneAndUpdate(
      { id: productId, 'inventory.stock': { $gte: quantity } },
      {
        $inc: {
          'inventory.stock':           -quantity,
          'inventory.sold':             quantity,
          'availability.stockLevel':   -quantity,
          soldCount:                    quantity,
        },
      },
      { new: true },
    )

    if (result) {
      const cached = this.products.find((p) => p.id === productId) as any
      if (cached) {
        if (cached.inventory?.stock !== undefined) cached.inventory.stock -= quantity
        if (cached.inventory?.sold  !== undefined) cached.inventory.sold  += quantity
        if (cached.availability?.stockLevel !== undefined) cached.availability.stockLevel -= quantity
        if (cached.soldCount !== undefined) cached.soldCount += quantity
        // Update inStock flag
        cached.inStock = (cached.availability?.stockLevel ?? cached.inventory?.stock ?? 0) > 0
      }
    }

    if (!result) this.logger.warn(`Stock decrement failed: productId=${productId} requested=${quantity}`)
    return !!result
  }

  async incrementStock(productId: string, quantity: number): Promise<void> {
    await this.productModel.findOneAndUpdate(
      { id: productId },
      {
        $inc: {
          'inventory.stock':          quantity,
          'inventory.sold':          -quantity,
          'availability.stockLevel':  quantity,
          soldCount:                 -quantity,
        },
      },
    )

    const cached = this.products.find((p) => p.id === productId) as any
    if (cached) {
      if (cached.inventory?.stock !== undefined) cached.inventory.stock += quantity
      if (cached.inventory?.sold  !== undefined) cached.inventory.sold  -= quantity
      if (cached.availability?.stockLevel !== undefined) cached.availability.stockLevel += quantity
      if (cached.soldCount !== undefined) cached.soldCount -= quantity
      cached.inStock = (cached.availability?.stockLevel ?? cached.inventory?.stock ?? 0) > 0
    }

    this.logger.log(`Stock restored: productId=${productId} qty=${quantity}`)
  }

  // ── Admin ──────────────────────────────────────────────────────────────────

  async adminFindAll(query: { page?: number; limit?: number; search?: string; isActive?: boolean }) {
    const filter: any = {}
    if (query.isActive !== undefined) filter.isActive = query.isActive
    if (query.search) {
      const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      filter.$or = [
        { title: { $regex: escaped, $options: 'i' } },
        { brand: { $regex: escaped, $options: 'i' } },
        { asin:  { $regex: escaped, $options: 'i' } },
      ]
    }
    const p = Number(query.page ?? 1), l = Number(query.limit ?? 20), skip = (p - 1) * l
    const [items, total] = await Promise.all([
      this.productModel.find(filter).skip(skip).limit(l).lean(),
      this.productModel.countDocuments(filter),
    ])
    return {
      products:   items,
      pagination: { total, page: p, limit: l, totalPages: Math.ceil(total / l), hasNextPage: p * l < total },
    }
  }

  async adminCreate(body: AdminCreateProductDto) {
    const existing = await this.productModel.findOne({ $or: [{ id: body.id }, { slug: body.slug }] })
    if (existing)
      throw new BadRequestException({ code: 'DUPLICATE_PRODUCT', message: 'A product with this id or slug already exists' })

    const product = await this.productModel.create(body)
    await this.invalidate()
    if (this.algolia.isReady()) await this.algolia.syncOne({ ...body, isActive: true })
    this.logger.log(`Product created: id=${body.id}`)
    return product
  }

  async adminUpdate(id: string, body: AdminUpdateProductDto) {
    const product = await this.productModel.findOneAndUpdate({ id }, { $set: body }, { new: true })
    if (!product)
      throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: `Product "${id}" not found` })

    await this.invalidate()
    if (this.algolia.isReady()) await this.algolia.syncOne(product)
    return product
  }

  async adminDelete(id: string) {
    const product = await this.productModel.findOneAndDelete({ id })
    if (!product)
      throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: `Product "${id}" not found` })

    await this.invalidate()
    if (this.algolia.isReady()) await this.algolia.deleteOne(id)
    this.logger.log(`Product deleted: id=${id}`)
    return { deleted: true, id }
  }
}