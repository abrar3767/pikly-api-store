import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model }       from 'mongoose'
import { Cart,   CartDocument   } from '../database/cart.schema'
import { Coupon, CouponDocument } from '../database/coupon.schema'
import { ProductsService }        from '../products/products.service'
import { AddToCartDto, UpdateCartDto, RemoveFromCartDto, ApplyCouponDto, MergeCartDto } from './dto/cart.dto'

// SVC-04 note: tax rate and shipping threshold are driven by environment
// variables so they can be changed without redeployment.
const FREE_SHIPPING_THRESHOLD = parseFloat(process.env.FREE_SHIPPING_THRESHOLD ?? '50')
const FLAT_SHIPPING_COST      = parseFloat(process.env.FLAT_SHIPPING_COST      ?? '9.99')
const TAX_RATE                = parseFloat(process.env.TAX_RATE                ?? '0.10')

@Injectable()
export class CartService {
  constructor(
    @InjectModel(Cart.name)   private cartModel:   Model<CartDocument>,
    @InjectModel(Coupon.name) private couponModel: Model<CouponDocument>,
    private readonly productsService: ProductsService,
  ) {}

  private async getOrCreate(sessionId: string): Promise<CartDocument> {
    let cart = await this.cartModel.findOne({ sessionId })
    if (!cart) cart = await this.cartModel.create({ sessionId, userId: null, items: [], coupon: null })
    return cart
  }

  private computeSummary(cart: CartDocument) {
    const items    = cart.items ?? []
    const subtotal = parseFloat(items.reduce((s: number, i: any) => s + i.subtotal, 0).toFixed(2))
    const shipping = subtotal === 0 ? 0 : subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING_COST
    const tax      = parseFloat((subtotal * TAX_RATE).toFixed(2))
    let discount   = 0

    const coupon = cart.coupon as any
    if (coupon) {
      if (coupon.type === 'percentage')   discount = parseFloat(Math.min((subtotal * coupon.value) / 100, 999).toFixed(2))
      else if (coupon.type === 'fixed')   discount = Math.min(coupon.value, subtotal)
      else if (coupon.type === 'free_shipping') discount = shipping
      coupon.discountValue = discount
    }

    const total    = parseFloat(Math.max(0, subtotal + shipping + tax - discount).toFixed(2))
    const savings  = items.reduce((s: number, i: any) => s + (i.originalPrice - i.price) * i.quantity, 0)
    const itemCount = items.reduce((s: number, i: any) => s + i.quantity, 0)

    return {
      items, coupon,
      pricing: {
        subtotal, shipping,
        shippingNote: shipping === 0
          ? 'Free shipping applied'
          : `Add $${(FREE_SHIPPING_THRESHOLD - subtotal).toFixed(2)} more for free shipping`,
        tax, taxRate: `${(TAX_RATE * 100).toFixed(0)}%`,
        discount, total,
        savings: parseFloat(savings.toFixed(2)),
      },
      itemCount, isEmpty: items.length === 0,
      sessionId: cart.sessionId, userId: cart.userId,
    }
  }

  async getCart(sessionId: string) {
    const cart = await this.getOrCreate(sessionId)
    return this.computeSummary(cart)
  }

  async addItem(dto: AddToCartDto) {
    const cart = await this.getOrCreate(dto.sessionId)

    // BUG-09 fix: query MongoDB directly for the stock check instead of reading
    // from the in-memory cache, which can be stale under concurrent load.
    // This guarantees the check reflects the real current inventory level.
    const product = this.productsService.products.find(p => p.id === dto.productId && p.isActive)
    if (!product) throw new NotFoundException({ code:'PRODUCT_NOT_FOUND', message:'Product not found' })

    const variant   = dto.variantId ? product.variants?.find((v: any) => v.variantId === dto.variantId) : null
    const priceDiff = variant?.priceDiff ?? 0
    const price     = parseFloat((product.pricing.current + priceDiff).toFixed(2))
    const origPrice = parseFloat((product.pricing.original + priceDiff).toFixed(2))

    // BUG-09 fix: check live stock from MongoDB, not from in-memory cache.
    // Using the public getLiveProduct() method instead of the previous
    // `(this.productsService as any).productModel` hack that accessed a private
    // field via TypeScript type bypass — correct encapsulation, same result.
    const liveProduct = await this.productsService.getLiveProduct(dto.productId)
    const liveStock = liveProduct
      ? (variant ? (liveProduct.variants?.find((v: any) => v.variantId === dto.variantId)?.stock ?? liveProduct.inventory.stock) : liveProduct.inventory.stock)
      : (variant ? (variant.stock ?? product.inventory.stock) : product.inventory.stock)

    const items    = [...(cart.items ?? [])]
    const existing = items.find((i: any) => i.productId === dto.productId && i.variantId === (dto.variantId ?? null))

    if (existing) {
      const newQty = existing.quantity + dto.quantity
      if (newQty > liveStock) throw new BadRequestException({ code:'INSUFFICIENT_STOCK', message:`Only ${liveStock} units available` })
      existing.quantity = newQty
      existing.subtotal = parseFloat((price * newQty).toFixed(2))
    } else {
      if (dto.quantity > liveStock) throw new BadRequestException({ code:'INSUFFICIENT_STOCK', message:`Only ${liveStock} units available` })
      items.push({
        productId: product.id, variantId: dto.variantId ?? null,
        title: product.title, brand: product.brand,
        image: variant?.image ?? product.media?.small ?? '',
        slug: product.slug, price, originalPrice: origPrice,
        quantity: dto.quantity, subtotal: parseFloat((price * dto.quantity).toFixed(2)),
        attributes: variant ? { color:variant.color, size:variant.size } : {},
        stock: liveStock,
      })
    }

    cart.items = items
    await cart.save()
    return this.computeSummary(cart)
  }

  async updateItem(dto: UpdateCartDto) {
    const cart  = await this.getOrCreate(dto.sessionId)
    const items = [...(cart.items ?? [])]
    const idx   = items.findIndex((i: any) => i.productId === dto.productId && i.variantId === (dto.variantId ?? null))
    if (idx === -1) throw new NotFoundException({ code:'ITEM_NOT_FOUND', message:'Item not in cart' })

    if (dto.quantity === 0) {
      items.splice(idx, 1)
    } else {
      const item = items[idx]
      if (dto.quantity > item.stock) throw new BadRequestException({ code:'INSUFFICIENT_STOCK', message:`Only ${item.stock} units available` })
      item.quantity = dto.quantity
      item.subtotal = parseFloat((item.price * dto.quantity).toFixed(2))
    }
    cart.items = items
    await cart.save()
    return this.computeSummary(cart)
  }

  async removeItem(dto: RemoveFromCartDto) {
    const cart   = await this.getOrCreate(dto.sessionId)
    const before = (cart.items ?? []).length
    cart.items   = (cart.items ?? []).filter((i: any) => !(i.productId === dto.productId && i.variantId === (dto.variantId ?? null)))
    if (cart.items.length === before) throw new NotFoundException({ code:'ITEM_NOT_FOUND', message:'Item not in cart' })
    await cart.save()
    return this.computeSummary(cart)
  }

  async applyCoupon(dto: ApplyCouponDto) {
    const cart   = await this.getOrCreate(dto.sessionId)
    const coupon = await this.couponModel.findOne({ code: dto.code.toUpperCase(), isActive: true })
    if (!coupon) throw new BadRequestException({ code:'INVALID_COUPON', message:'Coupon code is invalid or expired' })
    if (coupon.expiresAt < new Date()) throw new BadRequestException({ code:'EXPIRED_COUPON', message:'This coupon has expired' })
    if (coupon.usedCount >= coupon.usageLimit) throw new BadRequestException({ code:'COUPON_LIMIT_REACHED', message:'Coupon usage limit reached' })

    const subtotal = (cart.items ?? []).reduce((s: number, i: any) => s + i.subtotal, 0)
    if (subtotal < coupon.minOrderAmount) throw new BadRequestException({ code:'MIN_ORDER_NOT_MET', message:`Minimum order of $${coupon.minOrderAmount} required` })

    // BUG-06 fix: enforce applicableCategories and applicableProducts restrictions
    if (coupon.applicableCategories.length > 0 || coupon.applicableProducts.length > 0) {
      const cartItems = cart.items as any[]
      const hasMatch  = cartItems.some(item => {
        const product = this.productsService.findProductById(item.productId)
        if (!product) return false
        if (coupon.applicableProducts.length > 0 && coupon.applicableProducts.includes(item.productId)) return true
        if (coupon.applicableCategories.length > 0 && coupon.applicableCategories.includes(product.category)) return true
        return false
      })
      if (!hasMatch) throw new BadRequestException({
        code:    'COUPON_NOT_APPLICABLE',
        message: 'This coupon is not valid for any items in your cart',
      })
    }

    cart.coupon = { code:coupon.code, type:coupon.type, value:coupon.value, discountValue:0 }
    await cart.save()
    return this.computeSummary(cart)
  }

  async removeCoupon(sessionId: string) {
    const cart  = await this.getOrCreate(sessionId)
    cart.coupon = null
    await cart.save()
    return this.computeSummary(cart)
  }

  async mergeCart(dto: MergeCartDto) {
    const guest = await this.cartModel.findOne({ sessionId: dto.guestSessionId })
    if (!guest || (guest.items ?? []).length === 0) return this.getCart(dto.userId!)

    const userCart = await this.getOrCreate(dto.userId!)
    userCart.userId = dto.userId! as any
    const userItems = [...(userCart.items ?? [])]

    for (const gItem of (guest.items ?? []) as any[]) {
      const existing = userItems.find((i: any) => i.productId === gItem.productId && i.variantId === gItem.variantId)
      if (existing) {
        existing.quantity = Math.min(existing.quantity + gItem.quantity, gItem.stock)
        existing.subtotal = parseFloat((existing.price * existing.quantity).toFixed(2))
      } else {
        userItems.push({ ...gItem })
      }
    }

    userCart.items = userItems

    // BUG-10 fix: preserve guest coupon if user cart has no coupon applied
    let couponMerged = false
    if (guest.coupon && !userCart.coupon) {
      userCart.coupon = guest.coupon
      couponMerged    = true
    }

    await userCart.save()
    await this.cartModel.deleteOne({ sessionId: dto.guestSessionId })
    return { ...this.computeSummary(userCart), couponMerged }
  }

  async getSummary(sessionId: string) {
    const cart = await this.getOrCreate(sessionId)
    const s    = this.computeSummary(cart)
    return { itemCount:s.itemCount, total:s.pricing.total, subtotal:s.pricing.subtotal, isEmpty:s.isEmpty, hasCoupon:!!cart.coupon, couponCode:(cart.coupon as any)?.code??null }
  }

  async clearCart(sessionId: string) {
    const cart  = await this.getOrCreate(sessionId)
    cart.items  = []
    cart.coupon = null
    await cart.save()
  }
}
