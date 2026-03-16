import { Controller, Get, Post, Param, Query, Body, UseGuards, Request } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger'
import { AuthGuard } from '@nestjs/passport'
import { ProductsService } from './products.service'
import { CategoriesService } from '../categories/categories.service'
import { FilterProductsDto } from './dto/filter-products.dto'
import { ReviewQueryDto } from './dto/review-query.dto'
import { SubmitReviewDto } from './dto/submit-review.dto'
import { successResponse, paginatedResponse } from '../common/api-utils'

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly categoriesService: CategoriesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all products with filtering, search, sorting, facets' })
  async findAll(@Query() query: FilterProductsDto) {
    const { data, cacheHit } = await this.productsService.findAll(query)
    return paginatedResponse(data, data.pagination, { cacheHit })
  }

  @Get('featured')
  @ApiOperation({ summary: 'Featured products' })
  findFeatured() { return successResponse(this.productsService.findFeatured()) }

  @Get('bestsellers')
  @ApiOperation({ summary: 'Best selling products' })
  findBestsellers() { return successResponse(this.productsService.findBestsellers()) }

  @Get('new-arrivals')
  @ApiOperation({ summary: 'New arrival products' })
  findNewArrivals() { return successResponse(this.productsService.findNewArrivals()) }

  @Get('trending')
  @ApiOperation({ summary: 'Trending products' })
  findTrending() { return successResponse(this.productsService.findTrending()) }

  @Get('top-rated')
  @ApiOperation({ summary: 'Top rated products' })
  findTopRated() { return successResponse(this.productsService.findTopRated()) }

  @Get('on-sale')
  @ApiOperation({ summary: 'Products on sale' })
  findOnSale() { return successResponse(this.productsService.findOnSale()) }

  @Get('search/suggestions')
  @ApiOperation({ summary: 'Search suggestions (autocomplete)' })
  @ApiQuery({ name: 'q', required: true })
  getSuggestions(@Query('q') q: string) {
    return successResponse(this.productsService.getSuggestions(q, this.categoriesService.categories))
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Get single product by slug' })
  @ApiParam({ name: 'slug' })
  findOne(@Param('slug') slug: string) { return successResponse(this.productsService.findOne(slug)) }

  @Get(':slug/reviews')
  @ApiOperation({ summary: 'Get product reviews' })
  @ApiParam({ name: 'slug' })
  findReviews(@Param('slug') slug: string, @Query() query: ReviewQueryDto) {
    return successResponse(this.productsService.findReviews(slug, query))
  }

  @Post(':slug/reviews')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit a product review (requires auth)' })
  @ApiParam({ name: 'slug' })
  async submitReview(@Param('slug') slug: string, @Request() req: any, @Body() dto: SubmitReviewDto) {
    return successResponse(await this.productsService.submitReview(slug, req.user.userId, dto))
  }
}