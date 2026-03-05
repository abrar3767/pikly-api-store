import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiParam } from "@nestjs/swagger";
import { CategoriesService } from "./categories.service";
import { ProductsService } from "../products/products.service";
import { successResponse, paginatedResponse } from "../common/api-utils";

@ApiTags("Categories")
@Controller("categories")
export class CategoriesController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly productsService: ProductsService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Get full category tree (hierarchical)" })
  // FIX BUG#11: was successResponse(this.categoriesService.findAll()) which produced
  // data: { data: [...], cacheHit: false } — a double-wrap. Destructure properly.
  findAll() {
    const { data, cacheHit } = this.categoriesService.findAll();
    return successResponse(data, { cacheHit });
  }

  @Get("featured")
  @ApiOperation({ summary: "Get featured categories" })
  findFeatured() {
    return successResponse(this.categoriesService.findFeatured());
  }

  @Get(":slug")
  @ApiOperation({ summary: "Get single category with children" })
  @ApiParam({ name: "slug" })
  findOne(@Param("slug") slug: string) {
    return successResponse(this.categoriesService.findOne(slug));
  }

  @Get(":slug/products")
  @ApiOperation({
    summary: "Get products in a category with full filtering and pagination",
  })
  @ApiParam({ name: "slug" })
  // FIX BUG#13: was calling productsService.findAll() which bypassed categoriesService.findProducts()
  // entirely and returned a different response shape than GET /products. Now uses the correct
  // service method and returns the same paginatedResponse shape as the products listing.
  findProducts(@Param("slug") slug: string, @Query() query: any) {
    const activeProducts = this.productsService.products;
    const result = this.categoriesService.findProducts(
      slug,
      activeProducts,
      query,
    );
    return paginatedResponse(
      {
        products: result.items,
        facets: null,
        appliedFilters: result.appliedFilters,
        sortOptions: result.sortOptions,
      },
      {
        total: result.total,
        limit: result.limit,
        hasNextPage: result.hasNextPage,
        hasPrevPage: result.hasPrevPage,
        mode: (result as any).mode,
        ...((result as any).mode === "offset" && {
          page: (result as any).page,
          totalPages: (result as any).totalPages,
        }),
        ...((result as any).mode === "cursor" && {
          nextCursor: (result as any).nextCursor,
          prevCursor: (result as any).prevCursor,
        }),
      },
      { cacheHit: false },
    );
  }
}
