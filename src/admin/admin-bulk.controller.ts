import { Controller, Post, Body, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { IsArray, IsString, IsIn, ArrayMinSize, ArrayMaxSize } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { AuthGuard } from '@nestjs/passport'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { ProductsService } from '../products/products.service'
import { MailService } from '../mail/mail.service'
import { WebhookService } from '../webhooks/webhook.service'
import { Order, OrderDocument } from '../database/order.schema'
import { User, UserDocument } from '../database/user.schema'
import { successResponse } from '../common/api-utils'

// ── Concurrency limiter ──────────────────────────────────────────────────────
// Runs up to `concurrency` promises simultaneously, queueing the rest.
// This replaces the serial for...of loop (PERF-02) while bounding the number
// of simultaneous MongoDB connections to avoid connection pool exhaustion.
function withConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<any>,
): Promise<any[]> {
  let index = 0
  const results: any[] = new Array(items.length)

  async function worker(): Promise<void> {
    while (index < items.length) {
      const i = index++
      results[i] = await fn(items[i])
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, worker)
  return Promise.all(workers).then(() => results)
}

class BulkProductActionDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(100) // SEC-03: cap to prevent 10k-ID DoS attacks
  ids: string[]

  @ApiProperty({ enum: ['activate', 'deactivate', 'delete'] })
  @IsIn(['activate', 'deactivate', 'delete'])
  action: string
}

class BulkOrderActionDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(100) // SEC-03: cap to prevent DoS
  orderIds: string[]

  @ApiProperty({ enum: ['confirm', 'cancel', 'mark_shipped', 'mark_delivered'] })
  @IsIn(['confirm', 'cancel', 'mark_shipped', 'mark_delivered'])
  action: string
}

@ApiTags('Admin — Bulk Operations')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
@Controller('admin/bulk')
export class AdminBulkController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly mailService: MailService,
    private readonly webhookService: WebhookService,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  @Post('products')
  @ApiOperation({
    summary: '[Admin] Bulk product action: activate, deactivate, or delete (max 100 IDs)',
  })
  async bulkProducts(@Body() dto: BulkProductActionDto) {
    // PERF-02: process up to 10 products concurrently instead of serially
    const results = await withConcurrency(dto.ids, 10, async (id) => {
      try {
        if (dto.action === 'activate')
          await this.productsService.adminUpdate(id, { isActive: true })
        if (dto.action === 'deactivate')
          await this.productsService.adminUpdate(id, { isActive: false })
        if (dto.action === 'delete') await this.productsService.adminDelete(id)
        return { id, success: true }
      } catch (err: any) {
        return { id, success: false, error: err.message }
      }
    })

    const succeeded = results.filter((r) => r.success).length
    return successResponse({ results, succeeded, failed: results.length - succeeded })
  }

  @Post('orders')
  @ApiOperation({ summary: '[Admin] Bulk order status update (max 100 orders)' })
  async bulkOrders(@Body() dto: BulkOrderActionDto) {
    const statusMap: Record<string, string> = {
      confirm: 'confirmed',
      cancel: 'cancelled',
      mark_shipped: 'shipped',
      mark_delivered: 'delivered',
    }
    const newStatus = statusMap[dto.action]
    const now = new Date().toISOString()

    // PERF-02: 10-way parallel processing
    const results = await withConcurrency(dto.orderIds, 10, async (orderId) => {
      try {
        const order = await this.orderModel.findOne({ orderId })
        if (!order) return { orderId, success: false, error: 'Not found' }

        const prevStatus = order.status
        order.status = newStatus
        order.timeline.push({
          status: newStatus,
          timestamp: now,
          message: `Bulk updated to ${newStatus} by admin`,
        })

        if (newStatus === 'cancelled') {
          // BUG-05: COD orders were never paid, so "refunded" is semantically
          // wrong. Use "cancelled" for COD and "pending_refund" for card/wallet
          // to avoid falsely implying a refund was issued.
          order.paymentStatus = order.paymentMethod === 'cod' ? 'cancelled' : 'pending_refund'

          // Restore stock for all cancelled items
          for (const item of order.items as any[]) {
            await this.productsService.incrementStock(item.productId, item.quantity)
          }
        }

        if (newStatus === 'delivered') {
          order.paymentStatus = 'paid'

          // Loyalty points: award 1 point per whole dollar spent on delivery
          const pointsEarned = Math.floor(order.pricing?.total ?? 0)
          if (pointsEarned > 0) {
            await this.userModel.findByIdAndUpdate(order.userId, {
              $inc: { loyaltyPoints: pointsEarned },
            })
          }
        }

        if (newStatus === 'shipped' && prevStatus !== 'shipped' && !order.shippingEmailSent) {
          const user = (await this.userModel.findById(order.userId).lean()) as any
          if (user) {
            this.mailService
              .sendShippingNotification(user.email, user.firstName, order)
              .catch(() => {})
            order.shippingEmailSent = true
          }
        }

        await order.save()

        this.webhookService
          .dispatch('order.status_changed', {
            orderId: order.orderId,
            previousStatus: prevStatus,
            newStatus,
          })
          .catch(() => {})
        if (newStatus === 'shipped')
          this.webhookService.dispatch('order.shipped', { orderId: order.orderId }).catch(() => {})
        if (newStatus === 'delivered')
          this.webhookService
            .dispatch('order.delivered', { orderId: order.orderId })
            .catch(() => {})
        if (newStatus === 'cancelled')
          this.webhookService
            .dispatch('order.cancelled', { orderId: order.orderId })
            .catch(() => {})

        return { orderId, success: true, newStatus }
      } catch (err: any) {
        return { orderId, success: false, error: err.message }
      }
    })

    const succeeded = results.filter((r) => r.success).length
    return successResponse({ results, succeeded, failed: results.length - succeeded })
  }
}
