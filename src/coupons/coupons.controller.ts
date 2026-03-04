import { Controller, Get, Query } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger'
import { CouponsService }  from './coupons.service'
import { successResponse } from '../common/api-utils'

@ApiTags('Coupons')
@Controller('coupons')
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Get('validate')
  @ApiOperation({ summary: 'Validate a coupon code' })
  @ApiQuery({ name: 'code', required: true })
  validate(@Query('code') code: string) {
    return successResponse(this.couponsService.validate(code))
  }
}
