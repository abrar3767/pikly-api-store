import { Injectable, NotFoundException } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import Fuse from "fuse.js";
import { filterProducts } from "../common/filter-engine";
import { buildFacets } from "../common/facet-engine";
import { smartPaginate } from "../common/api-utils";
import { CacheService, TTL } from "../common/cache.service";
import { FilterProductsDto } from "./dto/filter-products.dto";
import { ReviewQueryDto } from "./dto/review-query.dto";

@Injectable()
export class ProductsService {
  private products: any[] = [];

  constructor(private readonly cache: CacheService) {
    this.loadProducts();
  }

  private loadProducts() {
    try {
      const filePath = path.join(process.cwd(), "data", "products.json");
      this.products = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch {
      this.products = [];
    }
  }

  // ── GET /products ──────────────────────────────────────────────────────────
  findAll(query: FilterProductsDto) {
    const cacheKey = `products:${JSON.stringify(query)}`;
    const cached = this.cache.get<any>(cacheKey);
    if (cached) return { ...cached, meta: { ...cached.meta, cacheHit: true } };

    const activeProducts = this.products.filter((p) => p.isActive);

    // Run filter engine — returns paginated items + metadata
    const filtered = filterProducts(activeProducts, query);

    // Build facets from ALL filtered results (before pagination)
    let facets = null;
    if (query.includeFacets) {
      // We need the full unpaginated filtered list for facet counts
      const allFiltered = filterProducts(activeProducts, {
        ...query,
        page: 1,
        limit: 99999,
      });
      facets = buildFacets(allFiltered.items, query as any);
    }

    const result = {
      products: filtered.items,
      pagination: {
        total: filtered.total,
        limit: filtered.limit,
        hasNextPage: filtered.hasNextPage,
        hasPrevPage: filtered.hasPrevPage,
        mode: (filtered as any).mode,
        ...((filtered as any).mode === "offset" && {
          page: (filtered as any).page,
          totalPages: (filtered as any).totalPages,
        }),
        ...((filtered as any).mode === "cursor" && {
          nextCursor: (filtered as any).nextCursor,
          prevCursor: (filtered as any).prevCursor,
        }),
      },
      facets,
      appliedFilters: filtered.appliedFilters,
      sortOptions: filtered.sortOptions,
      searchMeta: filtered.searchMeta,
    };

    this.cache.set(cacheKey, { data: result }, TTL.PRODUCTS);
    return { data: result, cacheHit: false };
  }

  // ── GET /products/featured ─────────────────────────────────────────────────
  findFeatured() {
    const items = this.products
      .filter((p) => p.isActive && p.featured)
      .sort((a, b) => b.ratings.average - a.ratings.average)
      .slice(0, 12);
    return items;
  }

  // ── GET /products/bestsellers ──────────────────────────────────────────────
  findBestsellers() {
    return this.products
      .filter((p) => p.isActive && p.bestSeller)
      .sort((a, b) => (b.inventory?.sold ?? 0) - (a.inventory?.sold ?? 0))
      .slice(0, 12);
  }

  // ── GET /products/new-arrivals ─────────────────────────────────────────────
  findNewArrivals() {
    return this.products
      .filter((p) => p.isActive && p.newArrival)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, 12);
  }

  // ── GET /products/trending ─────────────────────────────────────────────────
  findTrending() {
    return this.products.filter((p) => p.isActive && p.trending).slice(0, 12);
  }

  // ── GET /products/top-rated ────────────────────────────────────────────────
  findTopRated() {
    return this.products
      .filter((p) => p.isActive && p.topRated)
      .sort((a, b) => b.ratings.average - a.ratings.average)
      .slice(0, 12);
  }

  // ── GET /products/on-sale ──────────────────────────────────────────────────
  findOnSale() {
    return this.products
      .filter((p) => p.isActive && p.onSale)
      .sort((a, b) => b.pricing.discountPercent - a.pricing.discountPercent)
      .slice(0, 12);
  }

  // ── GET /products/search/suggestions ──────────────────────────────────────
  getSuggestions(q: string) {
    if (!q || q.trim().length < 2) return { suggestions: [] };

    const suggestions: any[] = [];

    // Product suggestions via Fuse.js
    const fuse = new Fuse(
      this.products.filter((p) => p.isActive),
      {
        keys: ["title", "brand", "tags"],
        threshold: 0.3,
        includeScore: true,
      },
    );
    const productHits = fuse.search(q.trim()).slice(0, 3);
    productHits.forEach(({ item }) => {
      suggestions.push({
        type: "product",
        title: item.title,
        slug: item.slug,
        image: item.media?.thumb ?? item.media?.small ?? "",
        price: item.pricing?.current,
      });
    });

    // Category suggestions
    const categoryKeywords = [
      "electronics",
      "laptops",
      "smartphones",
      "audio",
      "fashion",
      "shoes",
      "home-kitchen",
      "beauty",
      "sports-fitness",
      "books",
      "accessories",
    ];
    categoryKeywords
      .filter((c) => c.includes(q.toLowerCase()))
      .slice(0, 2)
      .forEach((c) =>
        suggestions.push({
          type: "category",
          title: c.charAt(0).toUpperCase() + c.slice(1).replace("-", " "),
          slug: c,
        }),
      );

    // Brand suggestions
    const allBrands = [...new Set(this.products.map((p) => p.brand))];
    const fuseB = new Fuse(
      allBrands.map((b) => ({ name: b })),
      { keys: ["name"], threshold: 0.3 },
    );
    fuseB
      .search(q)
      .slice(0, 2)
      .forEach(({ item }) => {
        suggestions.push({
          type: "brand",
          title: `${item.name}`,
          query: `?brand=${encodeURIComponent(item.name)}`,
        });
      });

    // Query suggestions
    suggestions.push({
      type: "query",
      title: `${q} under $500`,
      query: `?q=${encodeURIComponent(q)}&maxPrice=500`,
    });

    return { suggestions: suggestions.slice(0, 8) };
  }

  // ── GET /products/:slug ────────────────────────────────────────────────────
  findById(id: string) {
    const product = this.products.find((p) => p.id === id && p.isActive);
    if (!product)
      throw new NotFoundException({
        code: "PRODUCT_NOT_FOUND",
        message: `Product with id "${id}" not found`,
      });
    return this.findOne(product.slug);
  }

  findOne(slug: string) {
    const product = this.products.find((p) => p.slug === slug && p.isActive);
    if (!product)
      throw new NotFoundException({
        code: "PRODUCT_NOT_FOUND",
        message: `Product "${slug}" not found`,
      });

    // Related products — same subcategory, different product
    const related = this.products
      .filter(
        (p) =>
          p.isActive &&
          p.subcategory === product.subcategory &&
          p.id !== product.id,
      )
      .sort(
        (a, b) =>
          Math.abs(a.pricing.current - product.pricing.current) -
          Math.abs(b.pricing.current - product.pricing.current),
      )
      .slice(0, 8)
      .map((p) => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
        brand: p.brand,
        media: p.media,
        pricing: p.pricing,
        ratings: p.ratings,
        onSale: p.onSale,
        newArrival: p.newArrival,
      }));

    // Frequently bought with — random complementary products from other categories
    const otherCats = this.products
      .filter((p) => p.isActive && p.category !== product.category)
      .sort(() => Math.random() - 0.5)
      .slice(0, 4)
      .map((p) => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
        brand: p.brand,
        media: p.media,
        pricing: p.pricing,
        ratings: p.ratings,
      }));

    // Stock status
    const stock = product.inventory?.stock ?? 0;
    const stockStatus =
      stock === 0 ? "out_of_stock" : stock <= 10 ? "low_stock" : "in_stock";

    return {
      ...product,
      relatedProducts: related,
      frequentlyBoughtWith: otherCats,
      stockStatus,
      deliveryEstimate: {
        standard: `${product.shipping.estimatedDays.min}-${product.shipping.estimatedDays.max} days`,
        express: "1-2 days",
      },
    };
  }

  // ── GET /products/:slug/reviews ────────────────────────────────────────────
  findReviews(slug: string, query: ReviewQueryDto) {
    const product = this.products.find((p) => p.slug === slug);
    if (!product)
      throw new NotFoundException({
        code: "PRODUCT_NOT_FOUND",
        message: `Product "${slug}" not found`,
      });

    let reviews: any[] = [...(product.reviews ?? [])];

    // Filter by rating
    if (query.rating) {
      reviews = reviews.filter((r) => r.rating === Number(query.rating));
    }

    // Filter by verified
    if (query.verified === true) {
      reviews = reviews.filter((r) => r.verified === true);
    }

    // Sort
    switch (query.sort) {
      case "helpful":
        reviews.sort((a, b) => b.helpful - a.helpful);
        break;
      case "rating_high":
        reviews.sort((a, b) => b.rating - a.rating);
        break;
      case "rating_low":
        reviews.sort((a, b) => a.rating - b.rating);
        break;
      case "newest":
      default:
        reviews.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
    }

    const paginated = smartPaginate(reviews, {
      page: query.page,
      limit: query.limit ?? 10,
      cursor: query.cursor,
    });
    const dist = product.ratings.distribution ?? {};

    return {
      reviews: paginated.items,
      pagination: {
        total: paginated.total,
        limit: paginated.limit,
        hasNextPage: paginated.hasNextPage,
        hasPrevPage: paginated.hasPrevPage,
        mode: paginated.mode,
        ...(paginated.mode === "offset" && {
          page: (paginated as any).page,
          totalPages: (paginated as any).totalPages,
        }),
        ...(paginated.mode === "cursor" && {
          nextCursor: (paginated as any).nextCursor,
          prevCursor: (paginated as any).prevCursor,
        }),
      },
      summary: {
        average: product.ratings.average,
        total: product.ratings.count,
        distribution: dist,
        verifiedCount: reviews.filter((r) => r.verified).length,
        withImages: reviews.filter((r) => r.images?.length > 0).length,
      },
    };
  }
}
