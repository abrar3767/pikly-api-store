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

  // ── List & search ────────────────────────────────────────────────────────────
  @Get()
  @ApiOperation({ summary: 'Get all products with filtering, search, sorting and facets' })
  @ApiQuery({ name: 'q',              required: false, description: 'Search query'              })
  @ApiQuery({ name: 'category',       required: false, description: 'Category slug'             })
  @ApiQuery({ name: 'subcategory',    required: false, description: 'Subcategory slug'          })
  @ApiQuery({ name: 'brand',          required: false, description: 'Brand (comma-separated)'  })
  @ApiQuery({ name: 'minPrice',       required: false, description: 'Min price'                })
  @ApiQuery({ name: 'maxPrice',       required: false, description: 'Max price'                })
  @ApiQuery({ name: 'rating',         required: false, description: 'Min rating (1-5)'         })
  @ApiQuery({ name: 'discount',       required: false, description: 'Min discount %'           })
  @ApiQuery({ name: 'color',          required: false, description: 'Colors (comma-separated)' })
  @ApiQuery({ name: 'size',           required: false, description: 'Sizes (comma-separated)'  })
  @ApiQuery({ name: 'attrs',          required: false, description: 'Attribute filters e.g. ram:16GB,storage:512GB' })
  @ApiQuery({ name: 'inStock',        required: false, description: 'In stock only'            })
  @ApiQuery({ name: 'isPrime',        required: false, description: 'Prime eligible only'      })
  @ApiQuery({ name: 'freeShipping',   required: false, description: 'Free shipping only'       })
  @ApiQuery({ name: 'onSale',         required: false, description: 'On sale only'             })
  @ApiQuery({ name: 'bestSeller',     required: false, description: 'Best sellers only'        })
  @ApiQuery({ name: 'featured',       required: false, description: 'Featured only'            })
  @ApiQuery({ name: 'newArrival',     required: false, description: 'New arrivals only'        })
  @ApiQuery({ name: 'topRated',       required: false, description: 'Top rated only'           })
  @ApiQuery({ name: 'trending',       required: false, description: 'Trending only'            })
  @ApiQuery({ name: 'sort',           required: false, enum: ['relevance','price_asc','price_desc','rating_desc','newest','bestselling','discount_desc'] })
  @ApiQuery({ name: 'includeFacets',  required: false, description: 'Include facet counts (set true on first load)' })
  @ApiQuery({ name: 'page',           required: false, description: 'Page number (offset mode)' })
  @ApiQuery({ name: 'limit',          required: false, description: 'Results per page (max 100)' })
  @ApiQuery({ name: 'cursor',         required: false, description: 'Cursor for infinite scroll' })
  async findAll(@Query() query: FilterProductsDto) {
    const { data, cacheHit } = await this.productsService.findAll(query)
    return paginatedResponse(data, data.pagination, { cacheHit })
  }

  // ── Curated lists ────────────────────────────────────────────────────────────
  @Get('featured')
  @ApiOperation({ summary: 'Featured products' })
  findFeatured() {
    return successResponse(this.productsService.findFeatured())
  }

  @Get('bestsellers')
  @ApiOperation({ summary: 'Best selling products' })
  findBestsellers() {
    return successResponse(this.productsService.findBestsellers())
  }

  @Get('new-arrivals')
  @ApiOperation({ summary: 'New arrival products' })
  findNewArrivals() {
    return successResponse(this.productsService.findNewArrivals())
  }

  @Get('trending')
  @ApiOperation({ summary: 'Trending products' })
  findTrending() {
    return successResponse(this.productsService.findTrending())
  }

  @Get('top-rated')
  @ApiOperation({ summary: 'Top rated products' })
  findTopRated() {
    return successResponse(this.productsService.findTopRated())
  }

  @Get('on-sale')
  @ApiOperation({ summary: 'Products on sale' })
  findOnSale() {
    return successResponse(this.productsService.findOnSale())
  }

  // ── Search suggestions ────────────────────────────────────────────────────
  @Get('search/suggestions')
  @ApiOperation({ summary: 'Search suggestions / autocomplete' })
  @ApiQuery({ name: 'q', required: true, description: 'Search query (min 2 chars)' })
  getSuggestions(@Query('q') q: string) {
    return successResponse(
      this.productsService.getSuggestions(q, this.categoriesService.categories),
    )
  }

  // ── Single product — accepts slug OR asin OR internal id ─────────────────
  @Get(':slug')
  @ApiOperation({ summary: 'Get single product by slug, ASIN (B0XXXXXXXX) or internal id' })
  @ApiParam({ name: 'slug', description: 'Product slug, ASIN (B0XXXXXXXX) or internal id (prod_XXXX)' })
  findOne(@Param('slug') slug: string) {
    return successResponse(this.productsService.findOne(slug))
  }

  // ── Reviews ───────────────────────────────────────────────────────────────
  @Get(':slug/reviews')
  @ApiOperation({ summary: 'Get product reviews (paginated)' })
  @ApiParam({ name: 'slug', description: 'Product slug or ASIN' })
  @ApiQuery({ name: 'rating',   required: false, description: 'Filter by star rating (1-5)'  })
  @ApiQuery({ name: 'verified', required: false, description: 'Verified purchases only'      })
  @ApiQuery({ name: 'sort',     required: false, enum: ['newest','helpful','rating_high','rating_low'] })
  @ApiQuery({ name: 'page',     required: false })
  @ApiQuery({ name: 'limit',    required: false })
  findReviews(@Param('slug') slug: string, @Query() query: ReviewQueryDto) {
    return successResponse(this.productsService.findReviews(slug, query))
  }

  @Post(':slug/reviews')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit a product review (requires auth)' })
  @ApiParam({ name: 'slug', description: 'Product slug or ASIN' })
  async submitReview(
    @Param('slug') slug: string,
    @Request() req: any,
    @Body() dto: SubmitReviewDto,
  ) {
    return successResponse(
      await this.productsService.submitReview(slug, req.user.userId, dto),
    )
  }
}
