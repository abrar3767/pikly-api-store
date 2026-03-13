import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import * as mongoose from 'mongoose'
import { Order, OrderDocument } from '../database/order.schema'
import { User, UserDocument } from '../database/user.schema'
import { Coupon, CouponDocument } from '../database/coupon.schema'
import { Counter, CounterDocument } from '../database/counter.schema'
import { CreateOrderDto } from './dto/create-order.dto'
import { CartService } from '../cart/cart.service'
import { ProductsService } from '../products/products.service'
import { MailService } from '../mail/mail.service'
import { RedisService } from '../redis/redis.service'
import { WebhookService } from '../webhooks/webhook.service'

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name)

  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Coupon.name) private readonly couponModel: Model<CouponDocument>,
    @InjectModel(Counter.name) private readonly counterModel: Model<CounterDocument>,
    private readonly cartService: CartService,
    private readonly productsService: ProductsService,
    private readonly mailService: MailService,
    private readonly redis: RedisService,
    private readonly webhookService: WebhookService,
  ) {}

  private async generateOrderId(): Promise<string> {
    const result = await this.counterModel.findOneAndUpdate(
      { name: 'order' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true },
    )
    return `ORD-${new Date().getFullYear()}-${String(result!.seq).padStart(5, '0')}`
  }

  async createOrder(userId: string, dto: CreateOrderDto) {
    // Idempotency key — return original order on client retry
    if (dto.idempotencyKey) {
      const existing = await this.redis.getIdempotencyKey(dto.idempotencyKey)
      if (existing) {
        const order = await this.orderModel.findOne({ orderId: existing }).lean()
        if (order) return order
      }
    }

    const cart = await this.cartService.getCart(dto.sessionId)
    if (cart.isEmpty)
      throw new BadRequestException({ code: 'EMPTY_CART', message: 'Cart is empty' })

    const user = await this.userModel.findById(userId)
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND' })

    const address = (user.addresses ?? []).find((a: any) => a.id === dto.addressId)
    if (!address)
      throw new NotFoundException({ code: 'ADDRESS_NOT_FOUND', message: 'Address not found' })

    if (!address.street || !address.city || !address.country) {
      throw new BadRequestException({
        code: 'INCOMPLETE_ADDRESS',
        message: 'Shipping address must have street, city, and country',
      })
    }

    // ── Coupon validation ───────────────────────────────────────────────────
    let couponDoc: any = null
    if (cart.coupon) {
      couponDoc = await this.couponModel.findOne({ code: (cart.coupon as any).code })

      if (couponDoc) {
        // Global limit check
        if (couponDoc.usedCount >= couponDoc.usageLimit) {
          throw new BadRequestException({
            code: 'COUPON_LIMIT_REACHED',
            message: 'Coupon usage limit has been reached',
          })
        }

        // BUG-03: per-user check at order creation (the definitive enforcement
        // point, even if the applyCoupon check was skipped for guests)
        if (couponDoc.usedByUserIds.includes(userId)) {
          throw new BadRequestException({
            code: 'COUPON_ALREADY_USED',
            message: 'You have already used this coupon.',
          })
        }
      }
    }

    // ── Atomic stock decrement with rollback on partial failure ─────────────
    const decremented: Array<{ productId: string; quantity: number }> = []
    try {
      for (const item of cart.items as any[]) {
        const ok = await this.productsService.decrementStock(item.productId, item.quantity)
        if (!ok)
          throw new BadRequestException({
            code: 'INSUFFICIENT_STOCK',
            message: `"${item.title}" is no longer available in the requested quantity`,
          })
        decremented.push({ productId: item.productId, quantity: item.quantity })
      }
    } catch (err) {
      for (const d of decremented)
        await this.productsService.incrementStock(d.productId, d.quantity)
      throw err
    }

    const orderId = await this.generateOrderId()
    const now = new Date().toISOString()
    const paymentStatus = dto.paymentMethod === 'cod' ? 'pending' : 'paid'
    const orderStatus = dto.paymentMethod === 'cod' ? 'pending' : 'confirmed'

    let order: any
    try {
      order = await this.orderModel.create({
        orderId,
        userId: new mongoose.Types.ObjectId(userId),
        status: orderStatus,
        items: cart.items,
        pricing: cart.pricing,
        couponApplied: cart.coupon,
        shippingAddress: address,
        paymentMethod: dto.paymentMethod,
        paymentStatus,
        notes: dto.notes ?? null,
        timeline: [
          {
            status: orderStatus,
            timestamp: now,
            message:
              orderStatus === 'confirmed'
                ? 'Order confirmed and payment received'
                : 'Order placed — awaiting delivery',
          },
        ],
        trackingNumber: null,
        estimatedDelivery: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      })
    } catch (err) {
      for (const d of decremented)
        await this.productsService.incrementStock(d.productId, d.quantity)
      throw new InternalServerErrorException({
        code: 'ORDER_CREATE_FAILED',
        message: 'Order could not be saved. Please try again.',
      })
    }

    // BUG-03: atomic conditional increment of global usedCount + add userId to
    // usedByUserIds in a single findOneAndUpdate. If the global limit was hit
    // between our check above and this update (extremely rare race), the $lt
    // condition fails and we roll back the order.
    if (couponDoc) {
      const result = await this.couponModel.findOneAndUpdate(
        {
          code: couponDoc.code,
          usedCount: { $lt: couponDoc.usageLimit },
          // Also guard against the per-user check race: only proceed if userId
          // is still not in usedByUserIds (prevents double-use under concurrent requests)
          usedByUserIds: { $ne: userId },
        },
        {
          $inc: { usedCount: 1 },
          $addToSet: { usedByUserIds: userId },
        },
        { new: true },
      )
      if (!result) {
        // Coupon was exhausted or already used by this user between our check and now
        await this.orderModel.deleteOne({ orderId })
        for (const d of decremented)
          await this.productsService.incrementStock(d.productId, d.quantity)
        throw new BadRequestException({
          code: 'COUPON_LIMIT_REACHED',
          message: 'Coupon usage limit was reached. Please try again without the coupon.',
        })
      }
    }

    if (dto.idempotencyKey) {
      await this.redis.setIdempotencyKey(dto.idempotencyKey, orderId)
    }

    await this.cartService.clearCart(dto.sessionId)

    this.mailService.sendOrderConfirmation(user.email, user.firstName, order).catch(() => {})
    this.webhookService
      .dispatch('order.created', {
        orderId: order.orderId,
        status: order.status,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        total: order.pricing?.total,
      })
      .catch(() => {})

    this.logger.log(
      `Order created: orderId=${orderId} userId=${userId} total=${order.pricing?.total}`,
    )
    return order
  }

  async getUserOrders(userId: string, query: { page?: number; limit?: number; status?: string }) {
    const filter: any = { userId: new mongoose.Types.ObjectId(userId) }
    if (query.status) filter.status = query.status

    const page = Math.max(1, Number(query.page ?? 1))
    const limit = Math.min(50, Math.max(1, Number(query.limit ?? 10)))
    const skip = (page - 1) * limit

    const [orders, total] = await Promise.all([
      this.orderModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.orderModel.countDocuments(filter),
    ])

    return {
      orders,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
    }
  }

  async getOrder(orderId: string, requestingUserId: string) {
    const order = await this.orderModel.findOne({ orderId })
    if (!order || order.userId.toString() !== requestingUserId) {
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: `Order ${orderId} not found`,
      })
    }
    return order
  }

  async cancelOrder(orderId: string, requestingUserId: string) {
    const order = await this.orderModel.findOne({ orderId })
    if (!order || order.userId.toString() !== requestingUserId) {
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: `Order ${orderId} not found`,
      })
    }
    if (!['pending', 'confirmed'].includes(order.status)) {
      throw new BadRequestException({
        code: 'CANNOT_CANCEL',
        message: `Orders with status "${order.status}" cannot be cancelled`,
      })
    }

    order.status = 'cancelled'

    // BUG-05: paymentStatus logic corrected:
    // - COD orders were never charged, so "refunded" is factually wrong — use "cancelled"
    // - Card/wallet orders require a real refund via the payment gateway; we mark
    //   "pending_refund" to signal the finance team, not "refunded" (which implies
    //   the money was already returned to the customer).
    order.paymentStatus = order.paymentMethod === 'cod' ? 'cancelled' : 'pending_refund'

    order.timeline.push({
      status: 'cancelled',
      timestamp: new Date().toISOString(),
      message: 'Order cancelled by customer',
    })

    await order.save()

    // BUG-05: restore inventory for all items in the cancelled order.
    // The original implementation forgot this step, permanently consuming stock
    // for cancelled orders and causing inventory counts to drift lower over time.
    for (const item of order.items as any[]) {
      await this.productsService.incrementStock((item as any).productId, (item as any).quantity)
    }

    this.logger.log(
      `Order cancelled: orderId=${orderId} userId=${requestingUserId} method=${order.paymentMethod}`,
    )
    this.webhookService.dispatch('order.cancelled', { orderId: order.orderId }).catch(() => {})
    return order
  }

  async trackOrder(orderId: string, requestingUserId: string) {
    const order = await this.orderModel.findOne({ orderId })
    if (!order || order.userId.toString() !== requestingUserId) {
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: `Order ${orderId} not found`,
      })
    }
    return {
      orderId: order.orderId,
      status: order.status,
      timeline: order.timeline,
      trackingNumber: order.trackingNumber,
      estimatedDelivery: order.estimatedDelivery,
      shippingAddress: order.shippingAddress,
      currentStep: [
        'pending',
        'confirmed',
        'processing',
        'shipped',
        'delivered',
        'cancelled',
      ].indexOf(order.status),
    }
  }

  async calculateShipping(sessionId: string, addressId: string, userId: string) {
    const cart = await this.cartService.getCart(sessionId)
    const user = await this.userModel.findById(userId)
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND' })

    const address = (user.addresses ?? []).find((a: any) => a.id === addressId)
    if (!address) throw new NotFoundException({ code: 'ADDRESS_NOT_FOUND' })

    const subtotal = cart.pricing.subtotal
    const threshold = parseFloat(process.env.FREE_SHIPPING_THRESHOLD ?? '50')
    const flatRate = parseFloat(process.env.FLAT_SHIPPING_COST ?? '9.99')
    const expressRate = flatRate + 10
    const shippingStandard = subtotal >= threshold ? 0 : flatRate
    const shippingExpress = expressRate

    return {
      subtotal,
      options: [
        {
          method: 'standard',
          cost: shippingStandard,
          label:
            shippingStandard === 0
              ? 'Free Standard Shipping'
              : `Standard Shipping ($${shippingStandard})`,
          days: '3-7',
        },
        {
          method: 'express',
          cost: shippingExpress,
          label: `Express Shipping ($${shippingExpress})`,
          days: '1-2',
        },
      ],
      tax: cart.pricing.tax,
      total: parseFloat(
        (subtotal + shippingStandard + cart.pricing.tax - (cart.pricing.discount ?? 0)).toFixed(2),
      ),
    }
  }
}
