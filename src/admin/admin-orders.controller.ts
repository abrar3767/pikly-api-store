import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger'
import { AuthGuard } from '@nestjs/passport'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { ProductsService } from '../products/products.service'
import { Order, OrderDocument } from '../database/order.schema'
import { User, UserDocument } from '../database/user.schema'
import { MailService } from '../mail/mail.service'
import { WebhookService } from '../webhooks/webhook.service'
import { successResponse } from '../common/api-utils'

@ApiTags('Admin — Orders')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly mailService: MailService,
    private readonly webhookService: WebhookService,
    private readonly productsService: ProductsService,
  ) {}

  @Get('stats')
  @ApiOperation({ summary: '[Admin] Order count grouped by status' })
  async stats() {
    const result = await this.orderModel.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ])
    const stats: Record<string, number> = {}
    let total = 0
    for (const row of result) {
      stats[row._id] = row.count
      total += row.count
    }
    return successResponse({ ...stats, total })
  }

  @Get()
  @ApiOperation({ summary: '[Admin] List all orders with filters and pagination' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'search', required: false })
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
    @Query('userId') userId?: string,
    @Query('search') search?: string,
  ) {
    const filter: any = {}
    if (status) filter.status = status
    if (userId) filter.userId = userId
    if (search && search.length <= 100) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      filter.orderId = { $regex: escaped, $options: 'i' }
    }
    const p = Number(page ?? 1),
      l = Number(limit ?? 20),
      skip = (p - 1) * l
    const [orders, total] = await Promise.all([
      this.orderModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(l).lean(),
      this.orderModel.countDocuments(filter),
    ])
    return successResponse({
      orders,
      pagination: {
        total,
        page: p,
        limit: l,
        totalPages: Math.ceil(total / l),
        hasNextPage: p * l < total,
      },
    })
  }

  @Get(':orderId')
  @ApiOperation({ summary: '[Admin] Get single order by orderId' })
  @ApiParam({ name: 'orderId' })
  async findOne(@Param('orderId') orderId: string) {
    const order = await this.orderModel.findOne({ orderId }).lean()
    if (!order)
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: `Order ${orderId} not found`,
      })
    return successResponse(order)
  }

  @Patch(':orderId/status')
  @ApiOperation({ summary: '[Admin] Update order status' })
  @ApiParam({ name: 'orderId' })
  async updateStatus(
    @Param('orderId') orderId: string,
    @Body() body: { status: string; message?: string },
  ) {
    const valid = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled']
    if (!valid.includes(body.status)) {
      throw new BadRequestException({
        code: 'INVALID_STATUS',
        message: `Invalid status. Must be one of: ${valid.join(', ')}`,
      })
    }

    const order = await this.orderModel.findOne({ orderId })
    if (!order)
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: `Order ${orderId} not found`,
      })

    const prevStatus = order.status
    const now = new Date().toISOString()
    order.status = body.status

    order.timeline.push({
      status: body.status,
      timestamp: now,
      message: body.message ?? `Status updated to ${body.status} by admin`,
    })

    // ── Status-specific side effects ─────────────────────────────────────────

    if (body.status === 'cancelled') {
      // BUG-05: use semantically correct paymentStatus values.
      // COD orders were never charged — "refunded" is factually incorrect.
      // Card/wallet orders need a real gateway refund; "pending_refund" signals
      // that to the finance team without implying the money was already returned.
      order.paymentStatus = order.paymentMethod === 'cod' ? 'cancelled' : 'pending_refund'

      // BUG-05: restore inventory for all cancelled items
      for (const item of order.items as any[]) {
        await this.productsService.incrementStock(item.productId, item.quantity)
      }
    }

    if (body.status === 'delivered') {
      order.paymentStatus = 'paid'

      // Loyalty points: award 1 point per whole dollar of order total.
      // Points are accumulated on the User document and can be redeemed via
      // POST /users/loyalty/redeem. Using $inc is atomic — concurrent deliveries
      // on the same user's orders cannot race and lose increments.
      const pointsEarned = Math.floor(order.pricing?.total ?? 0)
      if (pointsEarned > 0) {
        await this.userModel.findByIdAndUpdate(order.userId, {
          $inc: { loyaltyPoints: pointsEarned },
        })
      }
    }

    if (prevStatus !== 'shipped' && body.status === 'shipped' && !order.shippingEmailSent) {
      const user = (await this.userModel.findById(order.userId).lean()) as any
      if (user) {
        this.mailService.sendShippingNotification(user.email, user.firstName, order).catch(() => {})
        order.shippingEmailSent = true
      }
    }

    await order.save()

    this.webhookService
      .dispatch('order.status_changed', {
        orderId: order.orderId,
        previousStatus: prevStatus,
        newStatus: body.status,
      })
      .catch(() => {})
    if (body.status === 'shipped')
      this.webhookService.dispatch('order.shipped', { orderId: order.orderId }).catch(() => {})
    if (body.status === 'delivered')
      this.webhookService.dispatch('order.delivered', { orderId: order.orderId }).catch(() => {})
    if (body.status === 'cancelled')
      this.webhookService.dispatch('order.cancelled', { orderId: order.orderId }).catch(() => {})

    return successResponse(order)
  }

  @Patch(':orderId/tracking')
  @ApiOperation({ summary: '[Admin] Set tracking number and mark order as shipped' })
  @ApiParam({ name: 'orderId' })
  async addTracking(
    @Param('orderId') orderId: string,
    @Body() body: { trackingNumber: string; estimatedDelivery?: string },
  ) {
    const order = await this.orderModel.findOne({ orderId })
    if (!order)
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: `Order ${orderId} not found`,
      })

    const wasShipped = order.status === 'shipped' || order.status === 'delivered'
    const now = new Date().toISOString()
    order.trackingNumber = body.trackingNumber
    order.estimatedDelivery = body.estimatedDelivery ?? order.estimatedDelivery

    if (!wasShipped) {
      order.status = 'shipped'
      order.timeline.push({
        status: 'shipped',
        timestamp: now,
        message: `Shipped with tracking number ${body.trackingNumber}`,
      })
      this.webhookService
        .dispatch('order.shipped', { orderId: order.orderId, trackingNumber: body.trackingNumber })
        .catch(() => {})
      this.webhookService
        .dispatch('order.status_changed', {
          orderId: order.orderId,
          previousStatus: 'processing',
          newStatus: 'shipped',
        })
        .catch(() => {})
    }

    if (!order.shippingEmailSent) {
      const user = (await this.userModel.findById(order.userId).lean()) as any
      if (user) {
        this.mailService.sendShippingNotification(user.email, user.firstName, order).catch(() => {})
        order.shippingEmailSent = true
      }
    }

    await order.save()
    return successResponse(order)
  }
}
