import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Cart, CartDocument } from "../database/cart.schema";
import { Coupon, CouponDocument } from "../database/coupon.schema";
import { ProductsService } from "../products/products.service";
import {
  AddToCartDto,
  UpdateCartDto,
  RemoveFromCartDto,
  ApplyCouponDto,
  MergeCartDto,
} from "./dto/cart.dto";

// CartService now reads products from ProductsService.products (in-memory, already
// loaded from MongoDB by ProductsService.onModuleInit) and coupons directly from
// the CouponModel. This eliminates the two fs.readFileSync calls that previously
// ran on every cold start (Bug #19). The cart itself is stored in MongoDB as before.

@Injectable()
export class CartService {
  constructor(
    @InjectModel(Cart.name) private cartModel: Model<CartDocument>,
    @InjectModel(Coupon.name) private couponModel: Model<CouponDocument>,
    private readonly productsService: ProductsService,
  ) {}

  // ── Private helpers ────────────────────────────────────────────────────────

  private async getOrCreate(sessionId: string): Promise<CartDocument> {
    let cart = await this.cartModel.findOne({ sessionId });
    if (!cart) {
      cart = await this.cartModel.create({
        sessionId,
        userId: null,
        items: [],
        coupon: null,
        // updatedAt is handled automatically by mongoose timestamps:true (Bug #6 fix)
      });
    }
    return cart;
  }

  private computeSummary(cart: CartDocument) {
    const items = cart.items ?? [];
    const subtotal = parseFloat(
      items.reduce((s: number, i: any) => s + i.subtotal, 0).toFixed(2),
    );
    const shipping = subtotal === 0 ? 0 : subtotal >= 50 ? 0 : 9.99;
    const tax = parseFloat((subtotal * 0.1).toFixed(2));
    let discount = 0;

    const coupon = cart.coupon as any;
    if (coupon) {
      if (coupon.type === "percentage")
        discount = parseFloat(
          Math.min((subtotal * coupon.value) / 100, 999).toFixed(2),
        );
      else if (coupon.type === "fixed")
        discount = Math.min(coupon.value, subtotal);
      else if (coupon.type === "free_shipping") discount = shipping;
      coupon.discountValue = discount;
    }

    const total = parseFloat(
      Math.max(0, subtotal + shipping + tax - discount).toFixed(2),
    );
    const savings = items.reduce(
      (s: number, i: any) => s + (i.originalPrice - i.price) * i.quantity,
      0,
    );
    const itemCount = items.reduce((s: number, i: any) => s + i.quantity, 0);

    return {
      items,
      coupon,
      pricing: {
        subtotal,
        shipping,
        shippingNote:
          shipping === 0
            ? "Free shipping applied"
            : `Add $${(50 - subtotal).toFixed(2)} more for free shipping`,
        tax,
        taxRate: "10%",
        discount,
        total,
        savings: parseFloat(savings.toFixed(2)),
      },
      itemCount,
      isEmpty: items.length === 0,
      sessionId: cart.sessionId,
      userId: cart.userId,
    };
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async getCart(sessionId: string) {
    const cart = await this.getOrCreate(sessionId);
    return this.computeSummary(cart);
  }

  async addItem(dto: AddToCartDto) {
    const cart = await this.getOrCreate(dto.sessionId);

    // Read product from ProductsService in-memory array — no DB call needed
    const product = this.productsService.products.find(
      (p) => p.id === dto.productId && p.isActive,
    );
    if (!product)
      throw new NotFoundException({
        code: "PRODUCT_NOT_FOUND",
        message: "Product not found",
      });

    const variant = dto.variantId
      ? product.variants?.find((v: any) => v.variantId === dto.variantId)
      : null;
    const stock = variant ? variant.stock : product.inventory.stock;
    const priceDiff = variant?.priceDiff ?? 0;
    const price = parseFloat((product.pricing.current + priceDiff).toFixed(2));
    const origPrice = parseFloat(
      (product.pricing.original + priceDiff).toFixed(2),
    );

    const items = [...(cart.items ?? [])];
    const existing = items.find(
      (i: any) =>
        i.productId === dto.productId &&
        i.variantId === (dto.variantId ?? null),
    );

    if (existing) {
      const newQty = existing.quantity + dto.quantity;
      if (newQty > stock)
        throw new BadRequestException({
          code: "INSUFFICIENT_STOCK",
          message: `Only ${stock} units available`,
        });
      existing.quantity = newQty;
      existing.subtotal = parseFloat((price * newQty).toFixed(2));
    } else {
      if (dto.quantity > stock)
        throw new BadRequestException({
          code: "INSUFFICIENT_STOCK",
          message: `Only ${stock} units available`,
        });
      items.push({
        productId: product.id,
        variantId: dto.variantId ?? null,
        title: product.title,
        brand: product.brand,
        image: variant?.image ?? product.media?.small ?? "",
        slug: product.slug,
        price,
        originalPrice: origPrice,
        quantity: dto.quantity,
        subtotal: parseFloat((price * dto.quantity).toFixed(2)),
        attributes: variant ? { color: variant.color, size: variant.size } : {},
        stock,
      });
    }

    cart.items = items;
    if (dto.userId) cart.userId = dto.userId;
    await cart.save();
    return this.computeSummary(cart);
  }

  async updateItem(dto: UpdateCartDto) {
    const cart = await this.getOrCreate(dto.sessionId);
    const items = [...(cart.items ?? [])];
    const idx = items.findIndex(
      (i: any) =>
        i.productId === dto.productId &&
        i.variantId === (dto.variantId ?? null),
    );
    if (idx === -1)
      throw new NotFoundException({
        code: "ITEM_NOT_FOUND",
        message: "Item not in cart",
      });

    if (dto.quantity === 0) {
      items.splice(idx, 1);
    } else {
      const item = items[idx];
      if (dto.quantity > item.stock)
        throw new BadRequestException({
          code: "INSUFFICIENT_STOCK",
          message: `Only ${item.stock} units available`,
        });
      item.quantity = dto.quantity;
      item.subtotal = parseFloat((item.price * dto.quantity).toFixed(2));
    }

    cart.items = items;
    await cart.save();
    return this.computeSummary(cart);
  }

  async removeItem(dto: RemoveFromCartDto) {
    const cart = await this.getOrCreate(dto.sessionId);
    const before = (cart.items ?? []).length;
    cart.items = (cart.items ?? []).filter(
      (i: any) =>
        !(
          i.productId === dto.productId &&
          i.variantId === (dto.variantId ?? null)
        ),
    );
    if (cart.items.length === before)
      throw new NotFoundException({
        code: "ITEM_NOT_FOUND",
        message: "Item not in cart",
      });
    await cart.save();
    return this.computeSummary(cart);
  }

  async applyCoupon(dto: ApplyCouponDto) {
    const cart = await this.getOrCreate(dto.sessionId);

    // Fetch coupon from MongoDB — admin can now create/edit coupons and changes apply immediately
    const coupon = await this.couponModel.findOne({
      code: dto.code.toUpperCase(),
      isActive: true,
    });
    if (!coupon)
      throw new BadRequestException({
        code: "INVALID_COUPON",
        message: "Coupon code is invalid or expired",
      });

    const now = new Date();
    if (new Date(coupon.expiresAt) < now)
      throw new BadRequestException({
        code: "EXPIRED_COUPON",
        message: "This coupon has expired",
      });
    if (coupon.usedCount >= coupon.usageLimit)
      throw new BadRequestException({
        code: "COUPON_LIMIT_REACHED",
        message: "Coupon usage limit has been reached",
      });

    const subtotal = (cart.items ?? []).reduce(
      (s: number, i: any) => s + i.subtotal,
      0,
    );
    if (subtotal < coupon.minOrderAmount) {
      throw new BadRequestException({
        code: "MIN_ORDER_NOT_MET",
        message: `Minimum order amount of $${coupon.minOrderAmount} required`,
      });
    }

    if (coupon.applicableCategories?.length > 0) {
      const productIds = (cart.items ?? []).map((i: any) => i.productId);
      const cartProducts = this.productsService.products.filter((p) =>
        productIds.includes(p.id),
      );
      const valid = cartProducts.some((p) =>
        coupon.applicableCategories.includes(p.category),
      );
      if (!valid)
        throw new BadRequestException({
          code: "COUPON_NOT_APPLICABLE",
          message: "Coupon not applicable to items in cart",
        });
    }

    cart.coupon = {
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      discountValue: 0,
    } as any;
    await cart.save();
    return this.computeSummary(cart);
  }

  async removeCoupon(sessionId: string) {
    const cart = await this.getOrCreate(sessionId);
    cart.coupon = null;
    await cart.save();
    return this.computeSummary(cart);
  }

  async mergeCart(dto: MergeCartDto) {
    const guest = await this.cartModel.findOne({
      sessionId: dto.guestSessionId,
    });
    if (!guest || (guest.items ?? []).length === 0)
      return this.getCart(dto.userId);

    const userCart = await this.getOrCreate(dto.userId);
    userCart.userId = dto.userId;
    const userItems = [...(userCart.items ?? [])];

    for (const gItem of (guest.items ?? []) as any[]) {
      const existing = userItems.find(
        (i: any) =>
          i.productId === gItem.productId && i.variantId === gItem.variantId,
      );
      if (existing) {
        existing.quantity = Math.min(
          existing.quantity + gItem.quantity,
          gItem.stock,
        );
        existing.subtotal = parseFloat(
          (existing.price * existing.quantity).toFixed(2),
        );
      } else {
        userItems.push({ ...gItem });
      }
    }

    userCart.items = userItems;
    await userCart.save();
    await this.cartModel.deleteOne({ sessionId: dto.guestSessionId });
    return this.computeSummary(userCart);
  }

  async getSummary(sessionId: string) {
    const cart = await this.getOrCreate(sessionId);
    const s = this.computeSummary(cart);
    return {
      itemCount: s.itemCount,
      total: s.pricing.total,
      subtotal: s.pricing.subtotal,
      isEmpty: s.isEmpty,
      hasCoupon: !!cart.coupon,
      couponCode: (cart.coupon as any)?.code ?? null,
    };
  }

  async clearCart(sessionId: string) {
    const cart = await this.getOrCreate(sessionId);
    cart.items = [];
    cart.coupon = null;
    await cart.save();
  }
}
