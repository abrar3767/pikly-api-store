import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import { CreateOrderDto } from "./dto/create-order.dto";
import { CartService } from "../cart/cart.service";
import { smartPaginate } from "../common/api-utils";

@Injectable()
export class OrdersService {
  private orders: any[] = [];
  private products: any[] = [];
  private users: any[] = [];
  private coupons: any[] = [];
  private counter = 1000;

  constructor(private readonly cartService: CartService) {
    this.load();
  }

  private load() {
    try {
      this.orders = JSON.parse(
        fs.readFileSync(
          path.join(process.cwd(), "data", "orders.json"),
          "utf-8",
        ),
      );
      this.products = JSON.parse(
        fs.readFileSync(
          path.join(process.cwd(), "data", "products.json"),
          "utf-8",
        ),
      );
      this.users = JSON.parse(
        fs.readFileSync(
          path.join(process.cwd(), "data", "users.json"),
          "utf-8",
        ),
      );
      this.coupons = JSON.parse(
        fs.readFileSync(
          path.join(process.cwd(), "data", "coupons.json"),
          "utf-8",
        ),
      );
      this.counter = this.orders.length + 1000;
    } catch {
      this.orders = [];
      this.products = [];
      this.users = [];
      this.coupons = [];
    }
  }

  createOrder(dto: CreateOrderDto) {
    const cart = this.cartService.getCart(dto.sessionId);
    if (cart.isEmpty)
      throw new BadRequestException({
        code: "EMPTY_CART",
        message: "Cart is empty",
      });

    const user = this.users.find((u) => u.id === dto.userId);
    if (!user)
      throw new NotFoundException({
        code: "USER_NOT_FOUND",
        message: "User not found",
      });

    const address = user.addresses?.find((a: any) => a.id === dto.addressId);
    if (!address)
      throw new NotFoundException({
        code: "ADDRESS_NOT_FOUND",
        message: "Address not found",
      });

    // Validate stock for each item
    for (const item of cart.items) {
      const product = this.products.find((p) => p.id === item.productId);
      if (!product)
        throw new NotFoundException({
          code: "PRODUCT_NOT_FOUND",
          message: `Product ${item.title} no longer available`,
        });
      if (product.inventory.stock < item.quantity) {
        throw new BadRequestException({
          code: "INSUFFICIENT_STOCK",
          message: `Only ${product.inventory.stock} units of "${item.title}" available`,
        });
      }
    }

    const orderId = `ORD-2025-${String(++this.counter).padStart(5, "0")}`;
    const now = new Date().toISOString();

    const order = {
      id: orderId,
      userId: dto.userId,
      status: "confirmed",
      items: cart.items,
      pricing: cart.pricing,
      couponApplied: cart.coupon,
      shippingAddress: address,
      paymentMethod: dto.paymentMethod,
      paymentStatus: "paid",
      notes: dto.notes ?? null,
      timeline: [
        {
          status: "confirmed",
          timestamp: now,
          message: "Order confirmed and payment received",
        },
      ],
      trackingNumber: null,
      estimatedDelivery: new Date(Date.now() + 5 * 86400000).toISOString(),
      createdAt: now,
      updatedAt: now,
    };

    this.orders.push(order);
    this.cartService.clearCart(dto.sessionId);
    return order;
  }

  // ── GET /orders — supports both offset (page) and cursor pagination ────────
  getUserOrders(
    userId: string,
    query: {
      page?: number;
      limit?: number;
      cursor?: string;
      status?: string;
    },
  ) {
    let orders = this.orders.filter((o) => o.userId === userId);
    if (query.status) orders = orders.filter((o) => o.status === query.status);
    orders.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const paginated = smartPaginate(orders, {
      page: query.page,
      limit: query.limit ?? 10,
      cursor: query.cursor,
    });

    return {
      orders: paginated.items,
      pagination: {
        total: paginated.total,
        limit: paginated.limit,
        hasNextPage: paginated.hasNextPage,
        hasPrevPage: paginated.hasPrevPage,
        mode: paginated.mode,
        // offset mode fields
        ...(paginated.mode === "offset" && {
          page: (paginated as any).page,
          totalPages: (paginated as any).totalPages,
        }),
        // cursor mode fields
        ...(paginated.mode === "cursor" && {
          nextCursor: (paginated as any).nextCursor,
          prevCursor: (paginated as any).prevCursor,
        }),
      },
    };
  }

  getOrder(orderId: string) {
    const order = this.orders.find((o) => o.id === orderId);
    if (!order)
      throw new NotFoundException({
        code: "ORDER_NOT_FOUND",
        message: `Order ${orderId} not found`,
      });
    return order;
  }

  cancelOrder(orderId: string) {
    const order = this.orders.find((o) => o.id === orderId);
    if (!order)
      throw new NotFoundException({
        code: "ORDER_NOT_FOUND",
        message: `Order ${orderId} not found`,
      });
    if (!["pending", "confirmed"].includes(order.status)) {
      throw new BadRequestException({
        code: "CANNOT_CANCEL",
        message: `Orders with status "${order.status}" cannot be cancelled`,
      });
    }
    order.status = "cancelled";
    order.paymentStatus = "refunded";
    order.updatedAt = new Date().toISOString();
    order.timeline.push({
      status: "cancelled",
      timestamp: new Date().toISOString(),
      message: "Order cancelled by customer",
    });
    return order;
  }

  trackOrder(orderId: string) {
    const order = this.orders.find((o) => o.id === orderId);
    if (!order)
      throw new NotFoundException({
        code: "ORDER_NOT_FOUND",
        message: `Order ${orderId} not found`,
      });
    return {
      orderId: order.id,
      status: order.status,
      timeline: order.timeline,
      trackingNumber: order.trackingNumber,
      estimatedDelivery: order.estimatedDelivery,
      shippingAddress: order.shippingAddress,
      currentStep: [
        "confirmed",
        "processing",
        "shipped",
        "delivered",
        "cancelled",
      ].indexOf(order.status),
    };
  }
}
