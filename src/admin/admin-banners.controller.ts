import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, UseGuards, HttpCode, HttpStatus, NotFoundException,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger'
import { AuthGuard }      from '@nestjs/passport'
import { RolesGuard }     from '../common/guards/roles.guard'
import { Roles }          from '../common/decorators/roles.decorator'
import { HomepageService } from '../homepage/homepage.service'
import { successResponse } from '../common/api-utils'

@ApiTags('Admin — Banners')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
@Controller('admin/banners')
export class AdminBannersController {
  constructor(private readonly homepageService: HomepageService) {}

  @Get()
  @ApiOperation({ summary: '[Admin] List all banners (including inactive and expired)' })
  async findAll() {
    return successResponse(await this.homepageService.adminGetBanners())
  }

  @Post()
  @ApiOperation({ summary: '[Admin] Create a new banner' })
  async create(@Body() body: any) {
    return successResponse(await this.homepageService.adminCreateBanner({
      id:        `ban_${Date.now()}`,
      title:     body.title,
      subtitle:  body.subtitle  ?? '',
      image:     body.image     ?? null,
      ctaText:   body.ctaText   ?? '',
      ctaLink:   body.ctaLink   ?? '',
      position:  body.position  ?? 'hero',
      startDate: body.startDate ?? new Date().toISOString(),
      endDate:   body.endDate   ?? new Date(Date.now() + 365 * 86_400_000).toISOString(),
      isActive:  body.isActive  ?? true,
      sortOrder: body.sortOrder ?? 99,
    }))
  }

  @Patch(':id')
  @ApiOperation({ summary: '[Admin] Update a banner by id' })
  @ApiParam({ name: 'id' })
  async update(@Param('id') id: string, @Body() body: any) {
    return successResponse(await this.homepageService.adminUpdateBanner(id, body))
  }

  @Patch(':id/toggle')
  @ApiOperation({ summary: '[Admin] Toggle banner active/inactive' })
  @ApiParam({ name: 'id' })
  async toggle(@Param('id') id: string) {
    const banners = await this.homepageService.adminGetBanners()
    const banner  = (banners as any[]).find((b: any) => b.id === id)
    if (!banner) throw new NotFoundException({ code: 'BANNER_NOT_FOUND', message: `Banner "${id}" not found` })
    return successResponse(await this.homepageService.adminUpdateBanner(id, { isActive: !banner.isActive }))
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Delete a banner permanently' })
  @ApiParam({ name: 'id' })
  async remove(@Param('id') id: string) {
    return successResponse(await this.homepageService.adminDeleteBanner(id))
  }
}
