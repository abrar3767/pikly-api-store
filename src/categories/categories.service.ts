import { Injectable, NotFoundException } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import { CacheService, TTL } from "../common/cache.service";
import { filterProducts } from "../common/filter-engine";

@Injectable()
export class CategoriesService {
  private categories: any[] = [];
  private products: any[] = [];

  constructor(private readonly cache: CacheService) {
    this.load();
  }

  private load() {
    try {
      this.categories = JSON.parse(
        fs.readFileSync(
          path.join(process.cwd(), "data", "categories.json"),
          "utf-8",
        ),
      );
      this.products = JSON.parse(
        fs.readFileSync(
          path.join(process.cwd(), "data", "products.json"),
          "utf-8",
        ),
      );
    } catch {
      this.categories = [];
      this.products = [];
    }
  }

  private buildTree() {
    const map: Record<string, any> = {};
    for (const c of this.categories) map[c.id] = { ...c, children: [] };
    const roots: any[] = [];
    for (const c of Object.values(map)) {
      if (c.parentId && map[c.parentId]) map[c.parentId].children.push(c);
      else roots.push(c);
    }
    return roots;
  }

  findAll() {
    const cached = this.cache.get<any>("categories:all");
    if (cached) return { data: cached, cacheHit: true };
    const tree = this.buildTree();
    this.cache.set("categories:all", tree, TTL.CATEGORIES);
    return { data: tree, cacheHit: false };
  }

  findFeatured() {
    return this.categories.filter((c) => c.isFeatured);
  }

  findOne(slug: string) {
    const cat = this.categories.find((c) => c.slug === slug);
    if (!cat)
      throw new NotFoundException({
        code: "CATEGORY_NOT_FOUND",
        message: `Category "${slug}" not found`,
      });
    return {
      ...cat,
      children: this.categories.filter((c) => c.parentId === cat.id),
    };
  }

  // ── GET /categories/:slug/products ────────────────────────────────────────
  // Supports both offset (page) and cursor pagination
  findProducts(slug: string, query: any) {
    const cat = this.categories.find((c) => c.slug === slug);
    if (!cat)
      throw new NotFoundException({
        code: "CATEGORY_NOT_FOUND",
        message: `Category "${slug}" not found`,
      });

    // Use filter-engine (already has smartPaginate inside)
    return filterProducts(
      this.products.filter((p) => p.isActive),
      { ...query, category: slug },
    );
  }
}
