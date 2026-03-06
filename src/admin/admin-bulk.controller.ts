import {
  Controller, Post, Body, UseGuards,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { IsArray, IsString, IsIn, ArrayMinSize } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'
import { AuthGuard }       from '@nestjs/passport'
import { InjectModel }     from '@nestjs/mongoose'
import { Model }           from 'mongoose'
import { RolesGuard }      from '../common/guards/roles.guard'
import { Roles }           from '../common/decorators/roles.decorator'
import { ProductsService } from '../products/products.service'
import { Order, OrderDocument } from '../database/order.schema'
import { successResponse }      from '../common/api-utils'

class BulkProductActionDto {
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) @ArrayMinSize(1) ids:    string[]
  @ApiProperty({ enum: ['activate','deactivate','delete'] })
  @IsIn(['activate','deactivate','delete'])
  action: string
}

class BulkOrderActionDto {
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) @ArrayMinSize(1) orderIds: string[]
  @ApiProperty({ enum: ['confirm','cancel','mark_shipped','mark_delivered'] })
  @IsIn(['confirm','cancel','mark_shipped','mark_delivered'])
  action: string
}

// FEAT-04: Bulk admin operations — activate/deactivate/delete multiple products
// or update multiple order statuses in a single request.
@ApiTags('Admin — Bulk Operations')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
@Controller('admin/bulk')
export class AdminBulkController {
  constructor(
    private readonly productsService: ProductsService,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
  ) {}

  @Post('products')
  @ApiOperation({ summary: '[Admin] Bulk product action: activate, deactivate, or delete' })
  async bulkProducts(@Body() dto: BulkProductActionDto) {
    const results: any[] = []
    for (const id of dto.ids) {
      try {
        if (dto.action === 'activate')   await this.productsService.adminUpdate(id, { isActive: true  })
        if (dto.action === 'deactivate') await this.productsService.adminUpdate(id, { isActive: false })
        if (dto.action === 'delete')     await this.productsService.adminDelete(id)
        results.push({ id, success: true })
      } catch (err: any) {
        results.push({ id, success: false, error: err.message })
      }
    }
    const succeeded = results.filter(r => r.success).length
    return successResponse({ results, succeeded, failed: results.length - succeeded })
  }

  @Post('orders')
  @ApiOperation({ summary: '[Admin] Bulk order status update: confirm, cancel, mark_shipped, mark_delivered' })
  async bulkOrders(@Body() dto: BulkOrderActionDto) {
    const statusMap: Record<string,string> = {
      confirm: 'confirmed', cancel: 'cancelled',
      mark_shipped: 'shipped', mark_delivered: 'delivered',
    }
    const newStatus = statusMap[dto.action]
    const now       = new Date().toISOString()
    const results: any[] = []

    for (const orderId of dto.orderIds) {
      try {
        const order = await this.orderModel.findOne({ orderId })
        if (!order) { results.push({ orderId, success:false, error:'Not found' }); continue }
        order.status = newStatus
        if (newStatus === 'cancelled')  order.paymentStatus = 'refunded'
        if (newStatus === 'delivered')  order.paymentStatus = 'paid'
        order.timeline.push({ status: newStatus, timestamp: now, message: `Bulk updated to ${newStatus} by admin` })
        await order.save()
        results.push({ orderId, success: true, newStatus })
      } catch (err: any) {
        results.push({ orderId, success: false, error: err.message })
      }
    }

    const succeeded = results.filter(r => r.success).length
    return successResponse({ results, succeeded, failed: results.length - succeeded })
  }
}
