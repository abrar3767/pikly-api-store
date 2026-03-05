import { Injectable } from "@nestjs/common";
import { ProductsService } from "../products/products.service";
import { smartPaginate } from "../common/api-utils";

// ImagesService no longer reads products.json itself. It reads directly from
// ProductsService.products — the shared in-memory array already loaded from
// MongoDB. The pagination and grouping logic is unchanged.

@Injectable()
export class ImagesService {
  constructor(private readonly productsService: ProductsService) {}

  getImages(query: { page?: number; limit?: number; cursor?: string }) {
    const { page, limit = 10, cursor } = query;

    const allProducts = this.productsService.products
      .filter((p) => p.isActive)
      .map((p) => ({
        title: p.title,
        slug: p.slug,
        categoryName: p.subSubcategory ?? p.subcategory ?? p.category,
        media: p.media,
      }));

    const paginated = smartPaginate(allProducts, { page, limit, cursor });

    // Group paginated slice by category name for the response shape
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
      ...(paginated.mode === "offset" && {
        currentPage: (paginated as any).page,
        totalPages: (paginated as any).totalPages,
        nextPage: paginated.hasNextPage ? (paginated as any).page + 1 : null,
        prevPage: paginated.hasPrevPage ? (paginated as any).page - 1 : null,
      }),
      ...(paginated.mode === "cursor" && {
        nextCursor: (paginated as any).nextCursor,
        prevCursor: (paginated as any).prevCursor,
      }),
    };
  }
}
