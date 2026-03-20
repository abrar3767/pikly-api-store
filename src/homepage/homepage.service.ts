import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { CacheService, TTL } from '../common/cache.service'
import { RedisService } from '../redis/redis.service'
import { Banner, BannerDocument } from '../database/banner.schema'
import { ProductsService } from '../products/products.service'
import { CategoriesService } from '../categories/categories.service'

@Injectable()
export class HomepageService implements OnModuleInit {
  constructor(
    @InjectModel(Banner.name) private bannerModel: Model<BannerDocument>,
    private readonly cache: CacheService,
    private readonly redis: RedisService,
    private readonly productsService: ProductsService,
    private readonly categoriesService: CategoriesService,
  ) {}

  async onModuleInit() {
    this.redis.subscribe('homepage:invalidate', () => {
      this.cache.del('homepage:main')
      this.cache.del('homepage:banners')
    })
  }

  // ── Mini product shape returned in homepage sections ─────────────────────────
  private mini(p: any) {
    return {
      id:          p.id,
      slug:        p.slug,
      asin:        p.asin        ?? null,
      title:       p.title,
      brand:       p.brand,
      // New schema: media.mainImage is the primary image
      image:       p.media?.mainImage ?? p.media?.images?.[0]?.url ?? '',
      media:       p.media,
      // New schema: flat price + nested pricing both available
      price:       p.price       ?? p.pricing?.current          ?? null,
      original:    p.pricing?.original                          ?? null,
      discount:    p.discountPercent ?? p.pricing?.discountPercent ?? 0,
      currency:    p.pricing?.currency                          ?? 'USD',
      pricing:     p.pricing,
      // New schema: flat avgRating + nested ratings both available
      rating:      p.avgRating   ?? p.ratings?.average          ?? null,
      reviews:     p.ratings?.total ?? p.ratings?.count         ?? 0,
      ratings:     p.ratings,
      // Badge flags
      isPrime:     p.isPrime     ?? false,
      inStock:     p.inStock     ?? false,
      freeShipping:p.freeShipping ?? false,
      onSale:      p.onSale      ?? false,
      newArrival:  p.newArrival  ?? false,
      featured:    p.featured    ?? false,
      bestSeller:  p.bestSeller  ?? false,
      trending:    p.trending    ?? false,
      topRated:    p.topRated    ?? false,
      badges:      p.badges      ?? null,
      recentSales: p.badges?.recentSales ?? null,
      category:    p.category,
      subcategory: p.subcategory,
    }
  }

  async invalidate() {
    this.cache.del('homepage:main')
    this.cache.del('homepage:banners')
    await this.redis.publish('homepage:invalidate', Date.now().toString())
  }

  async getHomepage() {
    const cached = this.cache.get<any>('homepage:main')
    if (cached) return { data: cached, cacheHit: true }

    const active     = this.productsService.products.filter((p) => (p as any).isActive)
    const categories = this.categoriesService.categories
    const now        = new Date()
    const banners    = await this.bannerModel.find({ isActive: true }).lean()

    const heroBanners = banners
      .filter((b: any) => b.position === 'hero' && new Date(b.endDate) > now)
      .sort((a: any, b: any) => a.sortOrder - b.sortOrder)

    const promotionalBanners = banners
      .filter((b: any) => b.position !== 'hero' && new Date(b.endDate) > now)
      .sort((a: any, b: any) => a.sortOrder - b.sortOrder)

    const featuredCategories = categories
      .filter((c: any) => c.isFeatured && c.level === 0)
      .slice(0, 8)

    const flashDeals:        any[] = []
    const newArrivals:       any[] = []
    const bestsellers:       any[] = []
    const trendingProducts:  any[] = []
    const topRated:          any[] = []
    const featuredProducts:  any[] = []

    for (const p of active) {
      const pa = p as any
      // FIX: parentheses around ?? so it doesn't mix with &&
      if (pa.onSale && (pa.discountPercent ?? pa.pricing?.discountPercent ?? 0) >= 20)
        flashDeals.push(pa)
      if (pa.newArrival)   newArrivals.push(pa)
      if (pa.bestSeller)   bestsellers.push(pa)
      if (pa.trending)     trendingProducts.push(pa)
      if (pa.topRated)     topRated.push(pa)
      if (pa.featured)     featuredProducts.push(pa)
    }

    // FIX: parentheses around ?? in sort comparisons to avoid TS operator precedence errors
    flashDeals.sort(
      (a, b) =>
        (b.discountPercent ?? b.pricing?.discountPercent ?? 0) -
        (a.discountPercent ?? a.pricing?.discountPercent ?? 0),
    )
    newArrivals.sort(
      (a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0),
    )
    bestsellers.sort(
      (a, b) => (b.soldCount ?? b.inventory?.sold ?? 0) - (a.soldCount ?? a.inventory?.sold ?? 0),
    )
    topRated.sort(
      (a, b) => (b.avgRating ?? b.ratings?.average ?? 0) - (a.avgRating ?? a.ratings?.average ?? 0),
    )
    featuredProducts.sort(
      (a, b) => (b.avgRating ?? b.ratings?.average ?? 0) - (a.avgRating ?? a.ratings?.average ?? 0),
    )
    trendingProducts.sort(
      (a, b) => (b.soldCount ?? b.inventory?.sold ?? 0) - (a.soldCount ?? a.inventory?.sold ?? 0),
    )

    // Build brand map
    const brandMap: Record<string, any> = {}
    for (const p of active) {
      const pa = p as any
      if (!pa.brand) continue
      const s = pa.brand.toLowerCase().replace(/[^a-z0-9]/g, '-')
      if (!brandMap[s]) brandMap[s] = { name: pa.brand, slug: s, count: 0 }
      brandMap[s].count++
    }

    const data = {
      heroBanners,
      featuredCategories,
      flashDeals:       flashDeals.slice(0, 8).map(this.mini.bind(this)),
      newArrivals:      newArrivals.slice(0, 8).map(this.mini.bind(this)),
      bestsellers:      bestsellers.slice(0, 8).map(this.mini.bind(this)),
      trendingProducts: trendingProducts.slice(0, 8).map(this.mini.bind(this)),
      topRated:         topRated.slice(0, 8).map(this.mini.bind(this)),
      featuredProducts: featuredProducts.slice(0, 8).map(this.mini.bind(this)),
      brands: Object.values(brandMap)
        .sort((a, b) => b.count - a.count)
        .slice(0, 16),
      promotionalBanners,
    }

    this.cache.set('homepage:main', data, TTL.HOMEPAGE)
    return { data, cacheHit: false }
  }

  async getBanners(position?: string) {
    const cacheKey = `homepage:banners:${position ?? 'all'}`
    const cached = this.cache.get<any>(cacheKey)
    if (cached) return cached

    const now = new Date()
    const all = await this.bannerModel.find({ isActive: true }).lean()
    const result = all
      .filter((b: any) => new Date(b.endDate) > now && (!position || b.position === position))
      .sort((a: any, b: any) => a.sortOrder - b.sortOrder)

    this.cache.set(cacheKey, result, 300)
    return result
  }

  async adminGetBanners() {
    return this.bannerModel.find({}).sort({ sortOrder: 1 }).lean()
  }

  async adminCreateBanner(body: any) {
    const banner = await this.bannerModel.create(body)
    await this.invalidate()
    return banner
  }

  async adminUpdateBanner(id: string, body: any) {
    const banner = await this.bannerModel.findOneAndUpdate({ id }, { $set: body }, { new: true })
    if (!banner)
      throw new NotFoundException({ code: 'BANNER_NOT_FOUND', message: `Banner "${id}" not found` })
    await this.invalidate()
    return banner
  }

  async adminDeleteBanner(id: string) {
    const banner = await this.bannerModel.findOneAndDelete({ id })
    if (!banner)
      throw new NotFoundException({ code: 'BANNER_NOT_FOUND', message: `Banner "${id}" not found` })
    await this.invalidate()
    return { deleted: true, id }
  }
}
