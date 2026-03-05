import { Injectable, BadRequestException, NotFoundException, OnModuleInit } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model }       from 'mongoose'
import { Order, OrderDocument } from '../database/order.schema'
import { User,  UserDocument  } from '../database/user.schema'
import { CreateOrderDto }       from './dto/create-order.dto'
import { CartService }          from '../cart/cart.service'
import { ProductsService }      from '../products/products.service'
import { smartPaginate }        from '../common/api-utils'

@Injectable()
export class OrdersService implements OnModuleInit {
  private counter = 1000

  constructor(
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(User.name)  private userModel:  Model<UserDocument>,
    private readonly cartService:     CartService,
    private readonly productsService: ProductsService,
  ) {}

  async onModuleInit() {
    const count  = await this.orderModel.countDocuments()
    this.counter = count + 1000
  }

  async createOrder(dto: CreateOrderDto) {
    const cart = await this.cartService.getCart(dto.sessionId)
    if (cart.isEmpty) throw new BadRequestException({ code: 'EMPTY_CART', message: 'Cart is empty' })

    const user = await this.userModel.findById(dto.userId)
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' })

    const address = user.addresses?.find((a: any) => a.id === dto.addressId)
    if (!address) throw new NotFoundException({ code: 'ADDRESS_NOT_FOUND', message: 'Address not found' })

    for (const item of cart.items as any[]) {
      const product = this.productsService.products.find(p => p.id === item.productId)
      if (!product) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: `Product "${item.title}" no longer available` })
      if (product.inventory.stock < item.quantity) throw new BadRequestException({ code: 'INSUFFICIENT_STOCK', message: `Only ${product.inventory.stock} units of "${item.title}" available` })
    }

    const year    = new Date().getFullYear()
    const orderId = `ORD-${year}-${String(++this.counter).padStart(5, '0')}`
    const now     = new Date().toISOString()

    const order = await this.orderModel.create({
      orderId, userId: dto.userId, status: 'confirmed',
      items: cart.items, pricing: cart.pricing, couponApplied: cart.coupon,
      shippingAddress: address, paymentMethod: dto.paymentMethod, paymentStatus: 'paid',
      notes: dto.notes ?? null,
      timeline: [{ status: 'confirmed', timestamp: now, message: 'Order confirmed and payment received' }],
      trackingNumber: null,
      estimatedDelivery: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    })

    await this.cartService.clearCart(dto.sessionId)
    return order
  }

  async getUserOrders(userId: string, query: { page?: number; limit?: number; cursor?: string; status?: string }) {
    const filter: any = { userId }
    if (query.status) filter.status = query.status
    const orders    = await this.orderModel.find(filter).sort({ createdAt: -1 }).lean()
    const paginated = smartPaginate(orders, { page: query.page, limit: query.limit ?? 10, cursor: query.cursor })
    return {
      orders:     paginated.items,
      pagination: {
        total: paginated.total, limit: paginated.limit,
        hasNextPage: paginated.hasNextPage, hasPrevPage: paginated.hasPrevPage, mode: paginated.mode,
        ...(paginated.mode==='offset' && { page:(paginated as any).page, totalPages:(paginated as any).totalPages }),
        ...(paginated.mode==='cursor' && { nextCursor:(paginated as any).nextCursor, prevCursor:(paginated as any).prevCursor }),
      },
    }
  }

  async getOrder(orderId: string) {
    const order = await this.orderModel.findOne({ orderId })
    if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: `Order ${orderId} not found` })
    return order
  }

  async cancelOrder(orderId: string) {
    const order = await this.orderModel.findOne({ orderId })
    if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: `Order ${orderId} not found` })
    if (!['pending','confirmed'].includes(order.status)) throw new BadRequestException({ code: 'CANNOT_CANCEL', message: `Orders with status "${order.status}" cannot be cancelled` })
    const now = new Date().toISOString()
    order.status = 'cancelled'; order.paymentStatus = 'refunded'
    order.timeline.push({ status: 'cancelled', timestamp: now, message: 'Order cancelled by customer' })
    await order.save()
    return order
  }

  async trackOrder(orderId: string) {
    const order = await this.orderModel.findOne({ orderId })
    if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: `Order ${orderId} not found` })
    return {
      orderId: order.orderId, status: order.status, timeline: order.timeline,
      trackingNumber: order.trackingNumber, estimatedDelivery: order.estimatedDelivery,
      shippingAddress: order.shippingAddress,
      currentStep: ['confirmed','processing','shipped','delivered','cancelled'].indexOf(order.status),
    }
  }
}
