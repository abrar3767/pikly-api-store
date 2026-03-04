import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import {
  AddToCartDto,
  UpdateCartDto,
  RemoveFromCartDto,
  ApplyCouponDto,
  MergeCartDto,
} from "./dto/cart.dto";

export interface CartItem {
  productId: string;
  variantId: string | null;
  title: string;
  brand: string;
  image: string;
  slug: string;
  price: number;
  originalPrice: number;
  quantity: number;
  subtotal: number;
  attributes: any;
  stock: number;
}

export interface CartCoupon {
  code: string;
  type: string;
  value: number;
  discountValue: number;
}

export interface Cart {
  sessionId: string;
  userId: string | null;
  items: CartItem[];
  coupon: CartCoupon | null;
  updatedAt: string;
}

@Injectable()
export class CartService {
  private carts = new Map<string, Cart>();
  private products: any[] = [];
  private coupons: any[] = [];

  constructor() {
    this.load();
  }

  private load() {
    try {
      this.products = JSON.parse(
        fs.readFileSync(
          path.join(process.cwd(), "data", "products.json"),
          "utf-8",
        ),
      );
      this.coupons = JSON.parse(
        fs.readFileSync(
          path.join(process.cwd(), "data", "coupons.json"),
          "utf-8",
        ),
      );
    } catch {
      this.products = [];
      this.coupons = [];
    }
  }

  private getOrCreate(sessionId: string): Cart {
    if (!this.carts.has(sessionId)) {
      this.carts.set(sessionId, {
        sessionId,
        userId: null,
        items: [],
        coupon: null,
        updatedAt: new Date().toISOString(),
      });
    }
    return this.carts.get(sessionId)!;
  }

  private computeSummary(cart: Cart) {
    const subtotal = parseFloat(
      cart.items.reduce((s, i) => s + i.subtotal, 0).toFixed(2),
    );
    const shipping = subtotal === 0 ? 0 : subtotal >= 50 ? 0 : 9.99;
    const tax = parseFloat((subtotal * 0.1).toFixed(2));
    let discount = 0;

    if (cart.coupon) {
      const c = cart.coupon;
      if (c.type === "percentage")
        discount = parseFloat(
          Math.min((subtotal * c.value) / 100, 999).toFixed(2),
        );
      else if (c.type === "fixed") discount = Math.min(c.value, subtotal);
      else if (c.type === "free_shipping") discount = shipping;
      cart.coupon.discountValue = discount;
    }

    const total = parseFloat(
      Math.max(0, subtotal + shipping + tax - discount).toFixed(2),
    );
    const savings = cart.items.reduce(
      (s, i) => s + (i.originalPrice - i.price) * i.quantity,
      0,
    );
    const itemCount = cart.items.reduce((s, i) => s + i.quantity, 0);

    return {
      items: cart.items,
      coupon: cart.coupon,
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
      isEmpty: cart.items.length === 0,
      sessionId: cart.sessionId,
      userId: cart.userId,
      updatedAt: cart.updatedAt,
    };
  }

  getCart(sessionId: string) {
    const cart = this.getOrCreate(sessionId);
    return this.computeSummary(cart);
  }

  addItem(dto: AddToCartDto) {
    const cart = this.getOrCreate(dto.sessionId);
    const product = this.products.find(
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

    const existing = cart.items.find(
      (i) =>
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
      cart.items.push({
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

    if (dto.userId) cart.userId = dto.userId;
    cart.updatedAt = new Date().toISOString();
    return this.computeSummary(cart);
  }

  updateItem(dto: UpdateCartDto) {
    const cart = this.getOrCreate(dto.sessionId);
    const idx = cart.items.findIndex(
      (i) =>
        i.productId === dto.productId &&
        i.variantId === (dto.variantId ?? null),
    );
    if (idx === -1)
      throw new NotFoundException({
        code: "ITEM_NOT_FOUND",
        message: "Item not in cart",
      });

    if (dto.quantity === 0) {
      cart.items.splice(idx, 1);
    } else {
      const item = cart.items[idx];
      if (dto.quantity > item.stock)
        throw new BadRequestException({
          code: "INSUFFICIENT_STOCK",
          message: `Only ${item.stock} units available`,
        });
      item.quantity = dto.quantity;
      item.subtotal = parseFloat((item.price * dto.quantity).toFixed(2));
    }

    cart.updatedAt = new Date().toISOString();
    return this.computeSummary(cart);
  }

  removeItem(dto: RemoveFromCartDto) {
    const cart = this.getOrCreate(dto.sessionId);
    const before = cart.items.length;
    cart.items = cart.items.filter(
      (i) =>
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
    cart.updatedAt = new Date().toISOString();
    return this.computeSummary(cart);
  }

  applyCoupon(dto: ApplyCouponDto) {
    const cart = this.getOrCreate(dto.sessionId);
    const coupon = this.coupons.find(
      (c) => c.code.toUpperCase() === dto.code.toUpperCase() && c.isActive,
    );
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

    const subtotal = cart.items.reduce((s, i) => s + i.subtotal, 0);
    if (subtotal < coupon.minOrderAmount) {
      throw new BadRequestException({
        code: "MIN_ORDER_NOT_MET",
        message: `Minimum order amount of $${coupon.minOrderAmount} required`,
      });
    }

    if (coupon.applicableCategories?.length > 0) {
      const productIds = cart.items.map((i) => i.productId);
      const cartProducts = this.products.filter((p) =>
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
    };
    cart.updatedAt = new Date().toISOString();
    return this.computeSummary(cart);
  }

  removeCoupon(sessionId: string) {
    const cart = this.getOrCreate(sessionId);
    cart.coupon = null;
    cart.updatedAt = new Date().toISOString();
    return this.computeSummary(cart);
  }

  mergeCart(dto: MergeCartDto) {
    const guest = this.carts.get(dto.guestSessionId);
    if (!guest || guest.items.length === 0) return this.getCart(dto.userId);

    const userCart = this.getOrCreate(dto.userId);
    userCart.userId = dto.userId;

    for (const gItem of guest.items) {
      const existing = userCart.items.find(
        (i) =>
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
        userCart.items.push({ ...gItem });
      }
    }

    this.carts.delete(dto.guestSessionId);
    userCart.updatedAt = new Date().toISOString();
    return this.computeSummary(userCart);
  }

  getSummary(sessionId: string) {
    const cart = this.getOrCreate(sessionId);
    const s = this.computeSummary(cart);
    return {
      itemCount: s.itemCount,
      total: s.pricing.total,
      subtotal: s.pricing.subtotal,
      isEmpty: s.isEmpty,
      hasCoupon: !!cart.coupon,
      couponCode: cart.coupon?.code ?? null,
    };
  }

  clearCart(sessionId: string) {
    const cart = this.getOrCreate(sessionId);
    cart.items = [];
    cart.coupon = null;
    cart.updatedAt = new Date().toISOString();
  }
}
