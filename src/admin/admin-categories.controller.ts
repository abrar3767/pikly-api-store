import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, HttpCode, HttpStatus, NotFoundException,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger'
import { AuthGuard }       from '@nestjs/passport'
import { RolesGuard }      from '../common/guards/roles.guard'
import { Roles }           from '../common/decorators/roles.decorator'
import { CategoriesService } from '../categories/categories.service'
import { successResponse }   from '../common/api-utils'

@ApiTags('Admin — Categories')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
@Controller('admin/categories')
export class AdminCategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: '[Admin] List all categories (flat, includes inactive)' })
  @ApiQuery({ name: 'isActive', required: false })
  findAll(@Query('isActive') isActive?: string) {
    let cats = this.categoriesService.categories
    if (isActive !== undefined) cats = cats.filter((c: any) => c.isActive === (isActive === 'true'))
    return successResponse(cats)
  }

  @Post()
  @ApiOperation({ summary: '[Admin] Create a new category' })
  async create(@Body() body: any) {
    return successResponse(await this.categoriesService.adminCreate(body))
  }

  @Patch(':id')
  @ApiOperation({ summary: '[Admin] Update category by id' })
  @ApiParam({ name: 'id' })
  async update(@Param('id') id: string, @Body() body: any) {
    return successResponse(await this.categoriesService.adminUpdate(id, body))
  }

  @Patch(':id/toggle')
  @ApiOperation({ summary: '[Admin] Toggle category active/inactive' })
  @ApiParam({ name: 'id' })
  async toggle(@Param('id') id: string) {
    const current = this.categoriesService.categories.find((c: any) => c.id === id)
    if (!current) throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND', message: `Category "${id}" not found` })
    return successResponse(await this.categoriesService.adminUpdate(id, { isActive: !current.isActive }))
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Delete a category permanently' })
  @ApiParam({ name: 'id' })
  async remove(@Param('id') id: string) {
    return successResponse(await this.categoriesService.adminDelete(id))
  }
}
