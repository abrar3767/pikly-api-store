import { Injectable } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import { CategoryShowcaseDto } from "./dto/category-showcase.dto";
import { smartPaginate } from "../common/api-utils";

@Injectable()
export class CategoryShowcaseService {
  private products: any[] = [];
  private categories: any[] = [];

  constructor() {
    this.load();
  }

  private load() {
    try {
      const dataDir = path.join(process.cwd(), "data");
      this.products = JSON.parse(
        fs.readFileSync(path.join(dataDir, "products.json"), "utf-8"),
      );
      this.categories = JSON.parse(
        fs.readFileSync(path.join(dataDir, "categories.json"), "utf-8"),
      );
    } catch {
      this.products = [];
      this.categories = [];
    }
  }

  getShowcase(dto: CategoryShowcaseDto) {
    const {
      page = 1,
      limit = 6,
      productsLimit = 4,
      category,
      onlyFeatured = false,
      sort = "productCount",
      cursor,
    } = dto;

    // Build unique top-level category map from products
    const categoryMap = new Map<
      string,
      {
        categoryName: string;
        categorySlug: string;
        featured: boolean;
        products: any[];
      }
    >();

    for (const product of this.products) {
      if (!product.isActive) continue;
      const key = product.category as string;
      if (!categoryMap.has(key)) {
        const catMeta = this.categories.find(
          (c: any) =>
            c.slug === key || c.name?.toLowerCase() === key?.toLowerCase(),
        );
        categoryMap.set(key, {
          categoryName: catMeta?.name ?? this.capitalize(key),
          categorySlug: key,
          featured: catMeta?.featured ?? false,
          products: [],
        });
      }
      categoryMap.get(key)!.products.push(product);
    }

    // Convert to array
    let categories = Array.from(categoryMap.values());

    // Filter by category slug
    if (category) {
      categories = categories.filter(
        (c) => c.categorySlug.toLowerCase() === category.toLowerCase(),
      );
    }

    // Filter featured only
    if (onlyFeatured) {
      categories = categories.filter((c) => c.featured);
    }

    // Sort
    if (sort === "alphabetical") {
      categories.sort((a, b) => a.categoryName.localeCompare(b.categoryName));
    } else {
      categories.sort((a, b) => b.products.length - a.products.length);
    }

    // ── Smart Paginate — offset (page) or cursor ───────────────────────────
    const paginated = smartPaginate(categories, {
      page: cursor ? undefined : (page ?? 1),
      limit: limit ?? 6,
      cursor: cursor ?? undefined,
    });

    // Build final response — slice products per category box
    const result = paginated.items.map((cat: any) => ({
      categoryName: cat.categoryName,
      categorySlug: cat.categorySlug,
      totalProducts: cat.products.length,
      products: cat.products.slice(0, productsLimit).map((p: any) => ({
        title: p.title,
        slug: p.slug,
        image: p.media?.small ?? p.media?.thumb ?? null,
      })),
    }));

    return {
      categories: result,
      pagination: {
        total: paginated.total,
        limit: paginated.limit,
        hasNextPage: paginated.hasNextPage,
        hasPrevPage: paginated.hasPrevPage,
        mode: paginated.mode,
        // offset mode fields
        ...(paginated.mode === "offset" && {
          page: (paginated as any).page,
          totalPages: (paginated as any).totalPages,
        }),
        // cursor mode fields
        ...(paginated.mode === "cursor" && {
          nextCursor: (paginated as any).nextCursor,
          prevCursor: (paginated as any).prevCursor,
        }),
      },
    };
  }

  private capitalize(str: string): string {
    return str
      ? str.charAt(0).toUpperCase() + str.slice(1).replace(/-/g, " ")
      : str;
  }
}
