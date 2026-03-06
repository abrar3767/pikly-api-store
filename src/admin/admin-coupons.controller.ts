import {
  Controller, Get, Post, Patch, Delete,
  Param, Query, Body, UseGuards, HttpCode, HttpStatus,
  NotFoundException, BadRequestException,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger'
import { AuthGuard }   from '@nestjs/passport'
import { InjectModel } from '@nestjs/mongoose'
import { Model }       from 'mongoose'
import { RolesGuard }  from '../common/guards/roles.guard'
import { Roles }       from '../common/decorators/roles.decorator'
import { Coupon, CouponDocument } from '../database/coupon.schema'
import { successResponse }        from '../common/api-utils'

@ApiTags('Admin — Coupons')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
@Controller('admin/coupons')
export class AdminCouponsController {
  constructor(@InjectModel(Coupon.name) private couponModel: Model<CouponDocument>) {}

  @Get()
  @ApiOperation({ summary: '[Admin] List all coupons (including inactive and expired)' })
  @ApiQuery({ name: 'isActive', required: false })
  async findAll(@Query('isActive') isActive?: string) {
    const filter: any = {}
    if (isActive !== undefined) filter.isActive = isActive === 'true'
    return successResponse(await this.couponModel.find(filter).sort({ createdAt: -1 }).lean())
  }

  @Post()
  @ApiOperation({ summary: '[Admin] Create a new coupon' })
  async create(@Body() body: any) {
    const existing = await this.couponModel.findOne({ code: body.code?.toUpperCase() })
    if (existing) {
      throw new BadRequestException({
        code:    'DUPLICATE_COUPON',
        message: `Coupon "${body.code}" already exists`,
      })
    }
    const id = `coup_${body.code?.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`
    return successResponse(await this.couponModel.create({
      id,
      code:                 body.code?.toUpperCase(),
      type:                 body.type,
      value:                body.value,
      minOrderAmount:       body.minOrderAmount       ?? 0,
      maxDiscount:          body.maxDiscount          ?? null,
      usageLimit:           body.usageLimit           ?? 1000,
      usedCount:            0,
      applicableCategories: body.applicableCategories ?? [],
      applicableProducts:   body.applicableProducts   ?? [],
      expiresAt:            body.expiresAt,
      isActive:             body.isActive             ?? true,
    }))
  }

  @Patch(':code')
  @ApiOperation({ summary: '[Admin] Update a coupon by code' })
  @ApiParam({ name: 'code' })
  async update(@Param('code') code: string, @Body() body: any) {
    // Prevent overwriting immutable fields via the update body.
    const { usedCount, id, code: _code, ...safeBody } = body
    const coupon = await this.couponModel.findOneAndUpdate(
      { code: code.toUpperCase() },
      { $set: safeBody },
      { new: true },
    )
    if (!coupon) throw new NotFoundException({ code: 'COUPON_NOT_FOUND', message: `Coupon "${code}" not found` })
    return successResponse(coupon)
  }

  @Patch(':code/toggle')
  @ApiOperation({ summary: '[Admin] Toggle coupon active/inactive' })
  @ApiParam({ name: 'code' })
  async toggle(@Param('code') code: string) {
    const coupon = await this.couponModel.findOne({ code: code.toUpperCase() })
    if (!coupon) throw new NotFoundException({ code: 'COUPON_NOT_FOUND', message: `Coupon "${code}" not found` })
    coupon.isActive = !coupon.isActive
    await coupon.save()
    return successResponse(coupon)
  }

  @Delete(':code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Delete a coupon permanently' })
  @ApiParam({ name: 'code' })
  async remove(@Param('code') code: string) {
    const coupon = await this.couponModel.findOneAndDelete({ code: code.toUpperCase() })
    if (!coupon) throw new NotFoundException({ code: 'COUPON_NOT_FOUND', message: `Coupon "${code}" not found` })
    return successResponse({ deleted: true, code: code.toUpperCase() })
  }
}
