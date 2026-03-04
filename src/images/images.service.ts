import { Injectable } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import { smartPaginate } from "../common/api-utils";

@Injectable()
export class ImagesService {
  private products: any[] = [];

  constructor() {
    try {
      this.products = JSON.parse(
        fs.readFileSync(
          path.join(process.cwd(), "data", "products.json"),
          "utf-8",
        ),
      );
    } catch {
      this.products = [];
    }
  }

  // ── GET /images — supports both offset (page) and cursor pagination ─────────
  getImages(query: { page?: number; limit?: number; cursor?: string }) {
    const { page, limit = 10, cursor } = query;

    // Flat list of all active products with their category label
    const allProducts = this.products
      .filter((p) => p.isActive)
      .map((p) => ({
        title: p.title,
        slug: p.slug,
        categoryName: p.subSubcategory ?? p.subcategory ?? p.category,
        media: p.media,
      }));

    // smartPaginate — offset or cursor based on what's passed
    const paginated = smartPaginate(allProducts, { page, limit, cursor });

    // Rebuild grouped from paginated slice
    const pagedGrouped: Record<string, any[]> = {};
    for (const p of paginated.items) {
      if (!pagedGrouped[p.categoryName]) pagedGrouped[p.categoryName] = [];
      pagedGrouped[p.categoryName].push({
        title: p.title,
        slug: p.slug,
        media: p.media,
      });
    }

    const imagesData = Object.entries(pagedGrouped).map(
      ([categoryName, products]) => ({
        categoryName,
        products,
      }),
    );

    return {
      imagesData,
      totalProducts: paginated.total,
      limit: paginated.limit,
      hasNextPage: paginated.hasNextPage,
      hasPrevPage: paginated.hasPrevPage,
      mode: paginated.mode,
      // offset mode fields
      ...(paginated.mode === "offset" && {
        currentPage: (paginated as any).page,
        totalPages: (paginated as any).totalPages,
        nextPage: paginated.hasNextPage ? (paginated as any).page + 1 : null,
        prevPage: paginated.hasPrevPage ? (paginated as any).page - 1 : null,
      }),
      // cursor mode fields
      ...(paginated.mode === "cursor" && {
        nextCursor: (paginated as any).nextCursor,
        prevCursor: (paginated as any).prevCursor,
      }),
    };
  }
}
