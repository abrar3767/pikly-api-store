import { Injectable } from '@nestjs/common'
import * as fs   from 'fs'
import * as path from 'path'
import { CacheService, TTL } from '../common/cache.service'

@Injectable()
export class HomepageService {
  private products:   any[] = []
  private categories: any[] = []
  private banners:    any[] = []

  constructor(private readonly cache: CacheService) {
    this.load()
  }

  private load() {
    try {
      this.products   = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'products.json'),   'utf-8'))
      this.categories = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'categories.json'), 'utf-8'))
      this.banners    = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'banners.json'),    'utf-8'))
    } catch { this.products = []; this.categories = []; this.banners = [] }
  }

  private mini(p: any) {
    return {
      id:      p.id,
      slug:    p.slug,
      title:   p.title,
      brand:   p.brand,
      media:   p.media,
      pricing: p.pricing,
      ratings: p.ratings,
      onSale:  p.onSale,
      newArrival: p.newArrival,
      featured:   p.featured,
      bestSeller: p.bestSeller,
      trending:   p.trending,
    }
  }

  getHomepage() {
    const cached = this.cache.get<any>('homepage:main')
    if (cached) return { data: cached, cacheHit: true }

    const active = this.products.filter(p => p.isActive)
    const now    = new Date()

    const heroBanners = this.banners
      .filter(b => b.isActive && b.position === 'hero' && new Date(b.endDate) > now)
      .sort((a, b) => a.sortOrder - b.sortOrder)

    const featuredCategories = this.categories
      .filter(c => c.isFeatured && c.level === 0)
      .slice(0, 8)

    const flashDeals = active
      .filter(p => p.onSale && p.pricing.discountPercent >= 20)
      .sort((a, b) => b.pricing.discountPercent - a.pricing.discountPercent)
      .slice(0, 8)
      .map(this.mini)

    const newArrivals = active
      .filter(p => p.newArrival)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 8)
      .map(this.mini)

    const bestsellers = active
      .filter(p => p.bestSeller)
      .sort((a, b) => (b.inventory?.sold ?? 0) - (a.inventory?.sold ?? 0))
      .slice(0, 8)
      .map(this.mini)

    const trendingProducts = active
      .filter(p => p.trending)
      .slice(0, 8)
      .map(this.mini)

    const topRated = active
      .filter(p => p.topRated)
      .sort((a, b) => b.ratings.average - a.ratings.average)
      .slice(0, 8)
      .map(this.mini)

    const featuredProducts = active
      .filter(p => p.featured)
      .sort((a, b) => b.ratings.average - a.ratings.average)
      .slice(0, 8)
      .map(this.mini)

    // Brand aggregation
    const brandMap: Record<string, { name: string; slug: string; count: number }> = {}
    for (const p of active) {
      const slug = p.brand.toLowerCase().replace(/[^a-z0-9]/g, '-')
      if (!brandMap[slug]) brandMap[slug] = { name: p.brand, slug, count: 0 }
      brandMap[slug].count++
    }
    const brands = Object.values(brandMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 16)

    const promotionalBanners = this.banners
      .filter(b => b.isActive && b.position !== 'hero' && new Date(b.endDate) > now)
      .sort((a, b) => a.sortOrder - b.sortOrder)

    const data = {
      heroBanners,
      featuredCategories,
      flashDeals,
      newArrivals,
      bestsellers,
      trendingProducts,
      topRated,
      featuredProducts,
      brands,
      promotionalBanners,
    }

    this.cache.set('homepage:main', data, TTL.HOMEPAGE)
    return { data, cacheHit: false }
  }

  getBanners(position?: string) {
    const now = new Date()
    let result = this.banners.filter(b => b.isActive && new Date(b.endDate) > now)
    if (position) result = result.filter(b => b.position === position)
    return result.sort((a, b) => a.sortOrder - b.sortOrder)
  }
}
