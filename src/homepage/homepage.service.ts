import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model }       from 'mongoose'
import { CacheService, TTL } from '../common/cache.service'
import { Banner, BannerDocument } from '../database/banner.schema'
import { ProductsService }    from '../products/products.service'
import { CategoriesService }  from '../categories/categories.service'

@Injectable()
export class HomepageService {
  constructor(
    @InjectModel(Banner.name) private bannerModel: Model<BannerDocument>,
    private readonly cache:              CacheService,
    private readonly productsService:    ProductsService,
    private readonly categoriesService:  CategoriesService,
  ) {}

  private mini(p: any) {
    return { id:p.id,slug:p.slug,title:p.title,brand:p.brand,media:p.media,pricing:p.pricing,ratings:p.ratings,onSale:p.onSale,newArrival:p.newArrival,featured:p.featured,bestSeller:p.bestSeller,trending:p.trending }
  }

  async invalidate() {
    this.cache.del("homepage:main");
  }

  async getHomepage() {
    const cached = this.cache.get<any>('homepage:main')
    if (cached) return { data: cached, cacheHit: true }

    const active     = this.productsService.products.filter(p => p.isActive)
    const categories = this.categoriesService.categories
    const now        = new Date()
    const banners    = await this.bannerModel.find({ isActive: true }).lean()

    const heroBanners = banners
      .filter((b:any) => b.position === 'hero' && new Date(b.endDate) > now)
      .sort((a:any,b:any) => a.sortOrder - b.sortOrder)

    const promotionalBanners = banners
      .filter((b:any) => b.position !== 'hero' && new Date(b.endDate) > now)
      .sort((a:any,b:any) => a.sortOrder - b.sortOrder)

    const featuredCategories = categories.filter(c => c.isFeatured && c.level === 0).slice(0,8)
    const flashDeals         = active.filter(p => p.onSale && p.pricing.discountPercent>=20).sort((a,b)=>b.pricing.discountPercent-a.pricing.discountPercent).slice(0,8).map(this.mini)
    const newArrivals        = active.filter(p => p.newArrival).sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime()).slice(0,8).map(this.mini)
    const bestsellers        = active.filter(p => p.bestSeller).sort((a,b)=>(b.inventory?.sold??0)-(a.inventory?.sold??0)).slice(0,8).map(this.mini)
    const trendingProducts   = active.filter(p => p.trending).slice(0,8).map(this.mini)
    const topRated           = active.filter(p => p.topRated).sort((a,b)=>b.ratings.average-a.ratings.average).slice(0,8).map(this.mini)
    const featuredProducts   = active.filter(p => p.featured).sort((a,b)=>b.ratings.average-a.ratings.average).slice(0,8).map(this.mini)

    const brandMap: Record<string,any> = {}
    for (const p of active) {
      const slug = p.brand.toLowerCase().replace(/[^a-z0-9]/g,'-')
      if (!brandMap[slug]) brandMap[slug] = { name:p.brand, slug, count:0 }
      brandMap[slug].count++
    }
    const brands = Object.values(brandMap).sort((a,b)=>b.count-a.count).slice(0,16)

    const data = { heroBanners,featuredCategories,flashDeals,newArrivals,bestsellers,trendingProducts,topRated,featuredProducts,brands,promotionalBanners }
    this.cache.set('homepage:main', data, TTL.HOMEPAGE)
    return { data, cacheHit: false }
  }

  async getBanners(position?: string) {
    const now  = new Date()
    const all  = await this.bannerModel.find({ isActive: true }).lean() as any[]
    const result = all.filter((b:any) => new Date(b.endDate) > now && (!position || b.position === position))
    return result.sort((a:any,b:any) => a.sortOrder - b.sortOrder)
  }

  // ── Admin helpers ────────────────────────────────────────────────────────
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
    if (!banner) throw new NotFoundException({ code: 'BANNER_NOT_FOUND', message: `Banner "${id}" not found` })
    await this.invalidate()
    return banner
  }

  async adminDeleteBanner(id: string) {
    const banner = await this.bannerModel.findOneAndDelete({ id })
    if (!banner) throw new NotFoundException({ code: 'BANNER_NOT_FOUND', message: `Banner "${id}" not found` })
    await this.invalidate()
    return { deleted: true, id }
  }
}
