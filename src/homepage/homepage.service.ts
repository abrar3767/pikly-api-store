import { Injectable, OnModuleInit } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { CacheService, TTL } from "../common/cache.service";
import { ProductsService } from "../products/products.service";
import { CategoriesService } from "../categories/categories.service";
import { Banner, BannerDocument } from "../database/banner.schema";

// HomepageService no longer loads any JSON files itself. It delegates to
// ProductsService and CategoriesService for their already-loaded in-memory
// arrays, and uses the BannerModel directly since banners are not needed by
// any other service (no shared in-memory array needed for banners).

@Injectable()
export class HomepageService implements OnModuleInit {
  constructor(
    @InjectModel(Banner.name) private bannerModel: Model<BannerDocument>,
    private readonly productsService: ProductsService,
    private readonly categoriesService: CategoriesService,
    private readonly cache: CacheService,
  ) {}

  // Banners are fetched from MongoDB directly since they are only used here.
  // We cache them to avoid a DB hit on every homepage request.
  async onModuleInit() {
    // Warm up the homepage cache on startup
    await this.getHomepage();
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
    };
  }

  async getHomepage() {
    const cached = this.cache.get<any>("homepage:main");
    if (cached) return { data: cached, cacheHit: true };

    const products = this.productsService.products;
    const categories = this.categoriesService.categories;
    const active = products.filter((p) => p.isActive);
    const now = new Date();

    // Fetch banners from MongoDB (small collection, fast query)
    const allBanners = await this.bannerModel.find({ isActive: true }).lean();
    const liveBanners = allBanners.filter((b) => new Date(b.endDate) > now);

    const heroBanners = liveBanners
      .filter((b) => b.position === "hero")
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const featuredCategories = categories
      .filter((c) => c.isFeatured && c.level === 0)
      .slice(0, 8);

    const flashDeals = active
      .filter((p) => p.onSale && p.pricing.discountPercent >= 20)
      .sort((a, b) => b.pricing.discountPercent - a.pricing.discountPercent)
      .slice(0, 8)
      .map((p) => this.mini(p));

    const newArrivals = active
      .filter((p) => p.newArrival)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, 8)
      .map((p) => this.mini(p));

    const bestsellers = active
      .filter((p) => p.bestSeller)
      .sort((a, b) => (b.inventory?.sold ?? 0) - (a.inventory?.sold ?? 0))
      .slice(0, 8)
      .map((p) => this.mini(p));

    const trendingProducts = active
      .filter((p) => p.trending)
      .slice(0, 8)
      .map((p) => this.mini(p));

    const topRated = active
      .filter((p) => p.topRated)
      .sort((a, b) => b.ratings.average - a.ratings.average)
      .slice(0, 8)
      .map((p) => this.mini(p));

    const featuredProducts = active
      .filter((p) => p.featured)
      .sort((a, b) => b.ratings.average - a.ratings.average)
      .slice(0, 8)
      .map((p) => this.mini(p));

    const brandMap: Record<
      string,
      { name: string; slug: string; count: number }
    > = {};
    for (const p of active) {
      const slug = p.brand.toLowerCase().replace(/[^a-z0-9]/g, "-");
      if (!brandMap[slug]) brandMap[slug] = { name: p.brand, slug, count: 0 };
      brandMap[slug].count++;
    }
    const brands = Object.values(brandMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 16);

    const promotionalBanners = liveBanners
      .filter((b) => b.position !== "hero")
      .sort((a, b) => a.sortOrder - b.sortOrder);

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
    };

    this.cache.set("homepage:main", data, TTL.HOMEPAGE);
    return { data, cacheHit: false };
  }

  async getBanners(position?: string) {
    const now = new Date();
    const filter: any = { isActive: true };
    if (position) filter.position = position;
    const banners = await this.bannerModel.find(filter).lean();
    return banners
      .filter((b) => new Date(b.endDate) > now)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  // Admin helper — called by AdminModule after banner mutations
  async invalidate() {
    this.cache.del("homepage:main");
    await this.getHomepage();
  }

  async adminGetBanners() {
    return this.bannerModel.find({}).sort({ sortOrder: 1 }).lean();
  }

  async adminCreateBanner(body: any) {
    const banner = await this.bannerModel.create(body);
    await this.invalidate();
    return banner;
  }

  async adminUpdateBanner(id: string, body: any) {
    const banner = await this.bannerModel.findOneAndUpdate(
      { id },
      { $set: body },
      { new: true },
    );
    if (!banner) throw new Error(`Banner "${id}" not found`);
    await this.invalidate();
    return banner;
  }

  async adminDeleteBanner(id: string) {
    const banner = await this.bannerModel.findOneAndDelete({ id });
    if (!banner) throw new Error(`Banner "${id}" not found`);
    await this.invalidate();
    return { deleted: true, id };
  }
}
