import { Controller, Get, Param, Query } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger'
import { CategoriesService } from './categories.service'
import { ProductsService }   from '../products/products.service'
import { successResponse }   from '../common/api-utils'

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
    return successResponse(this.categoriesService.findAll())
  }

  @Get('featured')
  @ApiOperation({ summary: 'Get featured categories' })
  findFeatured() {
    return successResponse(this.categoriesService.findFeatured())
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Get single category with filter config' })
  @ApiParam({ name: 'slug' })
  findOne(@Param('slug') slug: string) {
    return successResponse(this.categoriesService.findOne(slug))
  }

  @Get(':slug/products')
  @ApiOperation({ summary: 'Get products in a category' })
  @ApiParam({ name: 'slug' })
  findProducts(@Param('slug') slug: string, @Query() query: any) {
    const cat = this.categoriesService.findOne(slug)
    const { data } = this.productsService.findAll({ ...query, category: cat.slug })
    return successResponse(data)
  }
}
