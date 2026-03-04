import { Controller, Post, Body } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { CompareService }  from './compare.service'
import { successResponse } from '../common/api-utils'

@ApiTags('Compare')
@Controller('compare')
export class CompareController {
  constructor(private readonly compareService: CompareService) {}

  @Post()
  @ApiOperation({ summary: 'Compare 2–4 products side by side' })
  compare(@Body() body: { productIds: string[] }) {
    return successResponse(this.compareService.compare(body.productIds))
  }
}
