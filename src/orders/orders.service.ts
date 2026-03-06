import {
  Injectable, BadRequestException,
  NotFoundException, InternalServerErrorException,
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model }       from 'mongoose'
import { Order,   OrderDocument   } from '../database/order.schema'
import { User,    UserDocument    } from '../database/user.schema'
import { Coupon,  CouponDocument  } from '../database/coupon.schema'
import { Counter, CounterDocument } from '../database/counter.schema'
import { CreateOrderDto }           from './dto/create-order.dto'
import { CartService }              from '../cart/cart.service'
import { ProductsService }          from '../products/products.service'
import { smartPaginate }            from '../common/api-utils'

@Injectable()
export class OrdersService {
  constructor(
    @InjectModel(Order.name)   private readonly orderModel:   Model<OrderDocument>,
    @InjectModel(User.name)    private readonly userModel:    Model<UserDocument>,
    @InjectModel(Coupon.name)  private readonly couponModel:  Model<CouponDocument>,
    @InjectModel(Counter.name) private readonly counterModel: Model<CounterDocument>,
    private readonly cartService:     CartService,
    private readonly productsService: ProductsService,
  ) {}

  // ── Atomic order ID generation ─────────────────────────────────────────────
  // Uses MongoDB's $inc operator on a dedicated counters document so the
  // sequence is atomic across multiple processes. The old approach used an
  // in-memory counter that reset on each process restart and could produce
  // duplicate IDs in any multi-process or serverless deployment.
  private async generateOrderId(): Promise<string> {
    const result = await this.counterModel.findOneAndUpdate(
      { name: 'order' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true },
    )
    const year = new Date().getFullYear()
    return `ORD-${year}-${String(result!.seq).padStart(5, '0')}`
  }

  // ── Create order ───────────────────────────────────────────────────────────
  // userId comes from the verified JWT token, not from the request body.
  // Stock decrement is atomic per item via ProductsService.decrementStock().
  // If any item fails the stock check, all previously-decremented items are
  // rolled back before the error is thrown, preventing partial order states.
  async createOrder(userId: string, dto: CreateOrderDto) {
    const cart = await this.cartService.getCart(dto.sessionId)
    if (cart.isEmpty) {
      throw new BadRequestException({ code: 'EMPTY_CART', message: 'Cart is empty' })
    }

    const user = await this.userModel.findById(userId)
    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' })
    }

    const address = (user.addresses ?? []).find((a: any) => a.id === dto.addressId)
    if (!address) {
      throw new NotFoundException({ code: 'ADDRESS_NOT_FOUND', message: 'Address not found' })
    }

    // Atomically decrement stock for each cart item.
    // Track successful decrements so we can roll them back if a later item fails.
    const decremented: Array<{ productId: string; title: string; quantity: number }> = []

    try {
      for (const item of cart.items as any[]) {
        const success = await this.productsService.decrementStock(item.productId, item.quantity)
        if (!success) {
          throw new BadRequestException({
            code:    'INSUFFICIENT_STOCK',
            message: `"${item.title}" is no longer available in the requested quantity`,
          })
        }
        decremented.push({ productId: item.productId, title: item.title, quantity: item.quantity })
      }
    } catch (err) {
      // Roll back all successfully-decremented items before re-throwing.
      for (const d of decremented) {
        await this.productsService.incrementStock(d.productId, d.quantity)
      }
      throw err
    }

    const orderId = await this.generateOrderId()
    const now     = new Date().toISOString()

    let order: any
    try {
      order = await this.orderModel.create({
        orderId,
        userId,
        status:          'confirmed',
        items:           cart.items,
        pricing:         cart.pricing,
        couponApplied:   cart.coupon,
        shippingAddress: address,
        paymentMethod:   dto.paymentMethod,
        paymentStatus:   'paid',
        notes:           dto.notes ?? null,
        timeline:        [{ status: 'confirmed', timestamp: now, message: 'Order confirmed and payment received' }],
        trackingNumber:  null,
        estimatedDelivery: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      })
    } catch (err) {
      // If the order document failed to save (e.g. duplicate orderId race),
      // roll back all stock decrements so inventory stays consistent.
      for (const d of decremented) {
        await this.productsService.incrementStock(d.productId, d.quantity)
      }
      throw new InternalServerErrorException({
        code:    'ORDER_CREATE_FAILED',
        message: 'Order could not be saved. Please try again.',
      })
    }

    // Increment coupon used-count now that the order is committed.
    // The coupon usage limit check already ran when the coupon was applied to
    // the cart; this increment is the missing piece that actually enforces it.
    if (cart.coupon) {
      await this.couponModel.findOneAndUpdate(
        { code: (cart.coupon as any).code },
        { $inc: { usedCount: 1 } },
      )
    }

    await this.cartService.clearCart(dto.sessionId)
    return order
  }

  // ── User order queries ─────────────────────────────────────────────────────

  async getUserOrders(
    userId: string,
    query: { page?: number; limit?: number; cursor?: string; status?: string },
  ) {
    const filter: any = { userId }
    if (query.status) filter.status = query.status

    const orders    = await this.orderModel.find(filter).sort({ createdAt: -1 }).lean()
    const paginated = smartPaginate(orders, { page: query.page, limit: query.limit ?? 10, cursor: query.cursor })

    return {
      orders:     paginated.items,
      pagination: {
        total:       paginated.total,
        limit:       paginated.limit,
        hasNextPage: paginated.hasNextPage,
        hasPrevPage: paginated.hasPrevPage,
        mode:        paginated.mode,
        ...(paginated.mode==='offset' && { page:(paginated as any).page, totalPages:(paginated as any).totalPages }),
        ...(paginated.mode==='cursor' && { nextCursor:(paginated as any).nextCursor, prevCursor:(paginated as any).prevCursor }),
      },
    }
  }

  async getOrder(orderId: string, requestingUserId: string) {
    const order = await this.orderModel.findOne({ orderId })
    if (!order) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: `Order ${orderId} not found` })
    }
    // A regular user can only see their own orders. Admins bypass this check
    // via the admin controller and never call this method.
    if (order.userId !== requestingUserId) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: `Order ${orderId} not found` })
    }
    return order
  }

  async cancelOrder(orderId: string, requestingUserId: string) {
    const order = await this.orderModel.findOne({ orderId })
    if (!order) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: `Order ${orderId} not found` })
    }
    if (order.userId !== requestingUserId) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: `Order ${orderId} not found` })
    }
    if (!['pending','confirmed'].includes(order.status)) {
      throw new BadRequestException({
        code:    'CANNOT_CANCEL',
        message: `Orders with status "${order.status}" cannot be cancelled`,
      })
    }

    const now = new Date().toISOString()
    order.status        = 'cancelled'
    order.paymentStatus = 'refunded'
    order.timeline.push({ status: 'cancelled', timestamp: now, message: 'Order cancelled by customer' })
    await order.save()
    return order
  }

  async trackOrder(orderId: string, requestingUserId: string) {
    const order = await this.orderModel.findOne({ orderId })
    if (!order) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: `Order ${orderId} not found` })
    }
    if (order.userId !== requestingUserId) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: `Order ${orderId} not found` })
    }
    return {
      orderId:          order.orderId,
      status:           order.status,
      timeline:         order.timeline,
      trackingNumber:   order.trackingNumber,
      estimatedDelivery:order.estimatedDelivery,
      shippingAddress:  order.shippingAddress,
      currentStep:      ['confirmed','processing','shipped','delivered','cancelled'].indexOf(order.status),
    }
  }
}
