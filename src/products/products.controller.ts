import { Controller, Get, Param, Query } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger'
import { ProductsService }    from './products.service'
import { FilterProductsDto }  from './dto/filter-products.dto'
import { ReviewQueryDto }     from './dto/review-query.dto'
import { successResponse, paginatedResponse } from '../common/api-utils'

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  // ── GET /products ──────────────────────────────────────────────────────────
  @Get()
  @ApiOperation({ summary: 'Get all products with filtering, search, sorting, facets' })
  findAll(@Query() query: FilterProductsDto) {
    const { data, cacheHit } = this.productsService.findAll(query)
    return paginatedResponse(data, data.pagination, { cacheHit })
  }

  // ── SPECIAL ROUTES — must come BEFORE :slug ────────────────────────────────

  @Get('featured')
  @ApiOperation({ summary: 'Get featured products' })
  findFeatured() {
    return successResponse(this.productsService.findFeatured())
  }

  @Get('bestsellers')
  @ApiOperation({ summary: 'Get best selling products' })
  findBestsellers() {
    return successResponse(this.productsService.findBestsellers())
  }

  @Get('new-arrivals')
  @ApiOperation({ summary: 'Get new arrival products' })
  findNewArrivals() {
    return successResponse(this.productsService.findNewArrivals())
  }

  @Get('trending')
  @ApiOperation({ summary: 'Get trending products' })
  findTrending() {
    return successResponse(this.productsService.findTrending())
  }

  @Get('top-rated')
  @ApiOperation({ summary: 'Get top rated products' })
  findTopRated() {
    return successResponse(this.productsService.findTopRated())
  }

  @Get('on-sale')
  @ApiOperation({ summary: 'Get products on sale' })
  findOnSale() {
    return successResponse(this.productsService.findOnSale())
  }

  @Get('search/suggestions')
  @ApiOperation({ summary: 'Get search suggestions (autocomplete)' })
  @ApiQuery({ name: 'q', required: true, description: 'Search query' })
  getSuggestions(@Query('q') q: string) {
    return successResponse(this.productsService.getSuggestions(q))
  }

  // ── :slug routes ───────────────────────────────────────────────────────────

  @Get(':slug')
  @ApiOperation({ summary: 'Get single product by slug' })
  @ApiParam({ name: 'slug', description: 'Product slug' })
  findOne(@Param('slug') slug: string) {
    return successResponse(this.productsService.findOne(slug))
  }

  @Get(':slug/reviews')
  @ApiOperation({ summary: 'Get product reviews with filtering and sorting' })
  @ApiParam({ name: 'slug', description: 'Product slug' })
  findReviews(@Param('slug') slug: string, @Query() query: ReviewQueryDto) {
    return successResponse(this.productsService.findReviews(slug, query))
  }
}
