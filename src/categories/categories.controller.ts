import { Controller, Get, Param, Query } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger'
import { CategoriesService } from './categories.service'
import { ProductsService }   from '../products/products.service'
import { successResponse, paginatedResponse } from '../common/api-utils'

@ApiTags('Categories')
@Controller('categories')
export class CategoriesController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly productsService:   ProductsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get full category tree (hierarchical)' })
  findAll() {
    const { data, cacheHit } = this.categoriesService.findAll()
    return successResponse(data, { cacheHit })
  }

  @Get('featured')
  @ApiOperation({ summary: 'Get featured categories' })
  findFeatured() {
    return successResponse(this.categoriesService.findFeatured())
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Get single category with children' })
  @ApiParam({ name: 'slug' })
  findOne(@Param('slug') slug: string) {
    return successResponse(this.categoriesService.findOne(slug))
  }

  @Get(':slug/products')
  @ApiOperation({ summary: 'Get products filtered by category slug' })
  @ApiParam({ name: 'slug' })
  findProducts(@Param('slug') slug: string, @Query() query: any) {
    // Pass the shared in-memory products array — no extra DB call, always fresh
    const result = this.categoriesService.findProducts(
      slug,
      this.productsService.products,
      query,
    )
    return successResponse({
      products:   result.items,
      pagination: {
        total:       result.total,
        limit:       result.limit,
        hasNextPage: result.hasNextPage,
        hasPrevPage: result.hasPrevPage,
        mode:        (result as any).mode,
        ...((result as any).mode === 'offset' && { page: (result as any).page, totalPages: (result as any).totalPages }),
        ...((result as any).mode === 'cursor' && { nextCursor: (result as any).nextCursor, prevCursor: (result as any).prevCursor }),
      },
      appliedFilters: result.appliedFilters,
    })
  }
}
