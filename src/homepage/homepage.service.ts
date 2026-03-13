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

  // PERF-03: subscribe to the homepage:invalidate channel so that when any
  // pod (including this one) publishes an invalidation signal, every pod
  // clears its local in-process cache entries. Without this, admin updates
  // on one pod clear that pod's cache but the other N-1 pods continue
  // serving stale homepage data until their node-cache TTL expires (5 min).
  async onModuleInit() {
    this.redis.subscribe('homepage:invalidate', () => {
      this.cache.del('homepage:main')
      this.cache.del('homepage:banners')
    })
  }

  private mini(p: any) {
    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      brand: p.brand,
      media: p.media,
      pricing: p.pricing,
      ratings: p.ratings,
      onSale: p.onSale,
      newArrival: p.newArrival,
      featured: p.featured,
      bestSeller: p.bestSeller,
      trending: p.trending,
    }
  }

  async invalidate() {
    this.cache.del('homepage:main')
    this.cache.del('homepage:banners')
    // PERF-03: notify all other pods to clear their caches too
    await this.redis.publish('homepage:invalidate', Date.now().toString())
  }

  async getHomepage() {
    const cached = this.cache.get<any>('homepage:main')
    if (cached) return { data: cached, cacheHit: true }

    const active = this.productsService.products.filter((p) => p.isActive)
    const categories = this.categoriesService.categories
    const now = new Date()
    const banners = await this.bannerModel.find({ isActive: true }).lean()

    const heroBanners = banners
      .filter((b: any) => b.position === 'hero' && new Date(b.endDate) > now)
      .sort((a: any, b: any) => a.sortOrder - b.sortOrder)
    const promotionalBanners = banners
      .filter((b: any) => b.position !== 'hero' && new Date(b.endDate) > now)
      .sort((a: any, b: any) => a.sortOrder - b.sortOrder)
    const featuredCategories = categories
      .filter((c: any) => c.isFeatured && c.level === 0)
      .slice(0, 8)

    const flashDeals: any[] = [],
      newArrivals: any[] = [],
      bestsellers: any[] = []
    const trendingProducts: any[] = [],
      topRated: any[] = [],
      featuredProducts: any[] = []

    for (const p of active) {
      if (p.onSale && p.pricing.discountPercent >= 20) flashDeals.push(p)
      if (p.newArrival) newArrivals.push(p)
      if (p.bestSeller) bestsellers.push(p)
      if (p.trending) trendingProducts.push(p)
      if (p.topRated) topRated.push(p)
      if (p.featured) featuredProducts.push(p)
    }

    flashDeals.sort((a, b) => b.pricing.discountPercent - a.pricing.discountPercent)
    newArrivals.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    bestsellers.sort((a, b) => (b.inventory?.sold ?? 0) - (a.inventory?.sold ?? 0))
    topRated.sort((a, b) => b.ratings.average - a.ratings.average)
    featuredProducts.sort((a, b) => b.ratings.average - a.ratings.average)

    const brandMap: Record<string, any> = {}
    for (const p of active) {
      const slug = p.brand.toLowerCase().replace(/[^a-z0-9]/g, '-')
      if (!brandMap[slug]) brandMap[slug] = { name: p.brand, slug, count: 0 }
      brandMap[slug].count++
    }

    const data = {
      heroBanners,
      featuredCategories,
      flashDeals: flashDeals.slice(0, 8).map(this.mini),
      newArrivals: newArrivals.slice(0, 8).map(this.mini),
      bestsellers: bestsellers.slice(0, 8).map(this.mini),
      trendingProducts: trendingProducts.slice(0, 8).map(this.mini),
      topRated: topRated.slice(0, 8).map(this.mini),
      featuredProducts: featuredProducts.slice(0, 8).map(this.mini),
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
