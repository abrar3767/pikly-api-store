import {
  Injectable, BadRequestException,
  NotFoundException, InternalServerErrorException,
} from '@nestjs/common'
import { InjectModel }  from '@nestjs/mongoose'
import { Model }        from 'mongoose'
import * as mongoose    from 'mongoose'
import { Order,   OrderDocument   } from '../database/order.schema'
import { User,    UserDocument    } from '../database/user.schema'
import { Coupon,  CouponDocument  } from '../database/coupon.schema'
import { Counter, CounterDocument } from '../database/counter.schema'
import { CreateOrderDto }           from './dto/create-order.dto'
import { CartService }              from '../cart/cart.service'
import { ProductsService }          from '../products/products.service'
import { MailService }              from '../mail/mail.service'
import { RedisService }             from '../redis/redis.service'
import { WebhookService }           from '../webhooks/webhook.service'

@Injectable()
export class OrdersService {
  constructor(
    @InjectModel(Order.name)   private readonly orderModel:   Model<OrderDocument>,
    @InjectModel(User.name)    private readonly userModel:    Model<UserDocument>,
    @InjectModel(Coupon.name)  private readonly couponModel:  Model<CouponDocument>,
    @InjectModel(Counter.name) private readonly counterModel: Model<CounterDocument>,
    private readonly cartService:     CartService,
    private readonly productsService: ProductsService,
    private readonly mailService:     MailService,
    private readonly redis:           RedisService,
    private readonly webhookService:  WebhookService,
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
    // DES-03: Idempotency key — if the client retries after a network timeout,
    // return the original order instead of creating a duplicate.
    if (dto.idempotencyKey) {
      const existing = await this.redis.getIdempotencyKey(dto.idempotencyKey)
      if (existing) {
        const order = await this.orderModel.findOne({ orderId: existing }).lean()
        if (order) return order
      }
    }

    const cart = await this.cartService.getCart(dto.sessionId)
    if (cart.isEmpty) throw new BadRequestException({ code:'EMPTY_CART', message:'Cart is empty' })

    const user = await this.userModel.findById(userId)
    if (!user) throw new NotFoundException({ code:'USER_NOT_FOUND' })

    const address = (user.addresses ?? []).find((a: any) => a.id === dto.addressId)
    if (!address) throw new NotFoundException({ code:'ADDRESS_NOT_FOUND', message:'Address not found' })

    // Validate address has required fields (SCH-05 guard at service level)
    if (!address.street || !address.city || !address.country) {
      throw new BadRequestException({ code:'INCOMPLETE_ADDRESS', message:'Shipping address must have street, city, and country' })
    }

    // BUG-08 fix: verify coupon is still under its usage limit at checkout time
    // (it may have been exhausted by concurrent orders since the user applied it).
    // The actual atomic increment happens after the order is saved (see below).
    let couponDoc: any = null
    if (cart.coupon) {
      couponDoc = await this.couponModel.findOne({ code: (cart.coupon as any).code })
      if (couponDoc && couponDoc.usedCount >= couponDoc.usageLimit) {
        throw new BadRequestException({ code:'COUPON_LIMIT_REACHED', message:'Coupon usage limit has been reached' })
      }
    }

    // Atomic stock decrement with rollback on partial failure
    const decremented: Array<{ productId: string; quantity: number }> = []
    try {
      for (const item of cart.items as any[]) {
        const ok = await this.productsService.decrementStock(item.productId, item.quantity)
        if (!ok) throw new BadRequestException({ code:'INSUFFICIENT_STOCK', message:`"${item.title}" is no longer available in the requested quantity` })
        decremented.push({ productId: item.productId, quantity: item.quantity })
      }
    } catch (err) {
      for (const d of decremented) await this.productsService.incrementStock(d.productId, d.quantity)
      throw err
    }

    const orderId = await this.generateOrderId()
    const now     = new Date().toISOString()

    // SVC-01 fix: COD orders start as 'pending' — they are only marked 'paid'
    // when the admin confirms delivery. Card/wallet orders are immediately paid.
    const paymentStatus = dto.paymentMethod === 'cod' ? 'pending' : 'paid'
    // SVC-03 fix: use 'pending' for COD, 'confirmed' for online payments.
    const orderStatus   = dto.paymentMethod === 'cod' ? 'pending' : 'confirmed'

    let order: any
    try {
      order = await this.orderModel.create({
        orderId, userId: new mongoose.Types.ObjectId(userId),
        status:          orderStatus,
        items:           cart.items,
        pricing:         cart.pricing,
        couponApplied:   cart.coupon,
        shippingAddress: address,
        paymentMethod:   dto.paymentMethod,
        paymentStatus,
        notes:           dto.notes ?? null,
        timeline: [{ status: orderStatus, timestamp: now, message: orderStatus === 'confirmed' ? 'Order confirmed and payment received' : 'Order placed — awaiting delivery' }],
        trackingNumber:   null,
        estimatedDelivery: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      })
    } catch (err) {
      for (const d of decremented) await this.productsService.incrementStock(d.productId, d.quantity)
      throw new InternalServerErrorException({ code:'ORDER_CREATE_FAILED', message:'Order could not be saved. Please try again.' })
    }

    // BUG-08 fix: atomic conditional increment — only increments if still under limit
    if (couponDoc) {
      const result = await this.couponModel.findOneAndUpdate(
        { code: couponDoc.code, usedCount: { $lt: couponDoc.usageLimit } },
        { $inc: { usedCount: 1 } },
        { new: true },
      )
      if (!result) {
        // Extremely rare: limit hit between our check and save. Cancel the order.
        await this.orderModel.deleteOne({ orderId })
        for (const d of decremented) await this.productsService.incrementStock(d.productId, d.quantity)
        throw new BadRequestException({ code:'COUPON_LIMIT_REACHED', message:'Coupon usage limit was reached. Please try again without the coupon.' })
      }
    }

    // Store idempotency key
    if (dto.idempotencyKey) {
      await this.redis.setIdempotencyKey(dto.idempotencyKey, orderId)
    }

    await this.cartService.clearCart(dto.sessionId)

    // FEAT-06: send order confirmation email (non-blocking — never crashes order creation)
    this.mailService.sendOrderConfirmation(user.email, user.firstName, order).catch(() => {})

    // FEAT-05: fire webhook event so registered endpoints are notified
    this.webhookService.dispatch('order.created', {
      orderId: order.orderId, status: order.status,
      paymentMethod: order.paymentMethod, paymentStatus: order.paymentStatus,
      total: order.pricing?.total,
    }).catch(() => {})

    return order
  }

  // SVC-02 fix: use MongoDB's own .skip().limit() for pagination instead of
  // loading all orders into memory and slicing in Node.js.
  async getUserOrders(userId: string, query: { page?:number; limit?:number; status?:string }) {
    const filter: any = { userId: new mongoose.Types.ObjectId(userId) }
    if (query.status) filter.status = query.status

    const page  = Math.max(1, Number(query.page  ?? 1))
    const limit = Math.min(50, Math.max(1, Number(query.limit ?? 10)))
    const skip  = (page - 1) * limit

    const [orders, total] = await Promise.all([
      this.orderModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.orderModel.countDocuments(filter),
    ])

    return {
      orders,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit), hasNextPage: page * limit < total, hasPrevPage: page > 1 },
    }
  }

  async getOrder(orderId: string, requestingUserId: string) {
    const order = await this.orderModel.findOne({ orderId })
    if (!order || order.userId.toString() !== requestingUserId) {
      throw new NotFoundException({ code:'ORDER_NOT_FOUND', message:`Order ${orderId} not found` })
    }
    return order
  }

  async cancelOrder(orderId: string, requestingUserId: string) {
    const order = await this.orderModel.findOne({ orderId })
    if (!order || order.userId.toString() !== requestingUserId) {
      throw new NotFoundException({ code:'ORDER_NOT_FOUND', message:`Order ${orderId} not found` })
    }
    if (!['pending','confirmed'].includes(order.status)) {
      throw new BadRequestException({ code:'CANNOT_CANCEL', message:`Orders with status "${order.status}" cannot be cancelled` })
    }
    order.status        = 'cancelled'
    order.paymentStatus = 'refunded'
    order.timeline.push({ status:'cancelled', timestamp:new Date().toISOString(), message:'Order cancelled by customer' })
    await order.save()
    return order
  }

  async trackOrder(orderId: string, requestingUserId: string) {
    const order = await this.orderModel.findOne({ orderId })
    if (!order || order.userId.toString() !== requestingUserId) {
      throw new NotFoundException({ code:'ORDER_NOT_FOUND', message:`Order ${orderId} not found` })
    }
    return {
      orderId:           order.orderId,
      status:            order.status,
      timeline:          order.timeline,
      trackingNumber:    order.trackingNumber,
      estimatedDelivery: order.estimatedDelivery,
      shippingAddress:   order.shippingAddress,
      currentStep:       ['pending','confirmed','processing','shipped','delivered','cancelled'].indexOf(order.status),
    }
  }

  // FEAT-02: pre-checkout shipping cost calculation
  async calculateShipping(sessionId: string, addressId: string, userId: string) {
    const cart = await this.cartService.getCart(sessionId)
    const user = await this.userModel.findById(userId)
    if (!user) throw new NotFoundException({ code:'USER_NOT_FOUND' })

    const address = (user.addresses ?? []).find((a: any) => a.id === addressId)
    if (!address) throw new NotFoundException({ code:'ADDRESS_NOT_FOUND' })

    const subtotal        = cart.pricing.subtotal
    const threshold       = parseFloat(process.env.FREE_SHIPPING_THRESHOLD ?? '50')
    const flatRate        = parseFloat(process.env.FLAT_SHIPPING_COST ?? '9.99')
    const expressRate     = flatRate + 10
    const shippingStandard = subtotal >= threshold ? 0 : flatRate
    const shippingExpress  = expressRate

    return {
      subtotal,
      options: [
        { method:'standard', cost:shippingStandard, label:shippingStandard===0 ? 'Free Standard Shipping' : `Standard Shipping ($${shippingStandard})`, days:'3-7' },
        { method:'express',  cost:shippingExpress,  label:`Express Shipping ($${shippingExpress})`, days:'1-2' },
      ],
      tax:   cart.pricing.tax,
      total: parseFloat((subtotal + shippingStandard + cart.pricing.tax - (cart.pricing.discount ?? 0)).toFixed(2)),
    }
  }
}
