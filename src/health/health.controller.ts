import { Controller, Get } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { successResponse } from "../common/api-utils";
import { ProductsService } from "../products/products.service";
import { CategoriesService } from "../categories/categories.service";
import { User, UserDocument } from "../database/user.schema";
import { Order, OrderDocument } from "../database/order.schema";
import { Coupon, CouponDocument } from "../database/coupon.schema";
import { Banner, BannerDocument } from "../database/banner.schema";

// FIX BUG#29: the old implementation called fs.readFileSync on every single
// GET /health request, causing unnecessary disk I/O on every monitor poll.
// Worse, the counts for users and orders were always 0 because those were
// never in JSON files — they live in MongoDB. This version:
//   1. Reads products and categories from the already-loaded in-memory arrays.
//   2. Queries MongoDB for users, orders, coupons and banners counts.
//   3. Caches the MongoDB counts for 30 seconds so a monitoring service
//      polling every few seconds does not generate a DB query on every poll.

@ApiTags("Health")
@Controller("health")
export class HealthController {
  private cachedCounts: any = null;
  private cacheExpiry = 0;
  private readonly CACHE_TTL_MS = 30_000; // 30 seconds

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(Coupon.name) private couponModel: Model<CouponDocument>,
    @InjectModel(Banner.name) private bannerModel: Model<BannerDocument>,
    private readonly productsService: ProductsService,
    private readonly categoriesService: CategoriesService,
  ) {}

  @Get()
  @ApiOperation({ summary: "API health check with live data counts" })
  async check() {
    const now = Date.now();

    // Serve cached DB counts if still fresh — avoids a DB round-trip on every poll
    if (!this.cachedCounts || now > this.cacheExpiry) {
      const [users, orders, coupons, banners] = await Promise.all([
        this.userModel.countDocuments(),
        this.orderModel.countDocuments(),
        this.couponModel.countDocuments(),
        this.bannerModel.countDocuments(),
      ]);
      this.cachedCounts = { users, orders, coupons, banners };
      this.cacheExpiry = now + this.CACHE_TTL_MS;
    }

    return successResponse({
      status: "ok",
      uptime: process.uptime().toFixed(2) + "s",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
      environment: process.env.NODE_ENV ?? "development",
      dataLoaded: {
        // In-memory arrays — instantly available, no I/O
        products: this.productsService.products.length,
        categories: this.categoriesService.categories.length,
        // MongoDB counts — fresh every 30 seconds
        users: this.cachedCounts.users,
        orders: this.cachedCounts.orders,
        coupons: this.cachedCounts.coupons,
        banners: this.cachedCounts.banners,
      },
      memory: {
        heapUsed:
          (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2) + " MB",
        heapTotal:
          (process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2) + " MB",
      },
    });
  }
}
