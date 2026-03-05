import { Controller, Get } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { InjectModel } from '@nestjs/mongoose'
import { Model }       from 'mongoose'
import { successResponse }    from '../common/api-utils'
import { ProductsService }    from '../products/products.service'
import { CategoriesService }  from '../categories/categories.service'
import { User,   UserDocument   } from '../database/user.schema'
import { Order,  OrderDocument  } from '../database/order.schema'
import { Coupon, CouponDocument } from '../database/coupon.schema'
import { Banner, BannerDocument } from '../database/banner.schema'

@ApiTags('Health')
@Controller('health')
export class HealthController {
  // Cache counts for 30s so a monitor pinging every 5s doesn't hammer MongoDB
  private countCache: { data: any; expiresAt: number } | null = null

  constructor(
    private readonly productsService:   ProductsService,
    private readonly categoriesService: CategoriesService,
    @InjectModel(User.name)   private userModel:   Model<UserDocument>,
    @InjectModel(Order.name)  private orderModel:  Model<OrderDocument>,
    @InjectModel(Coupon.name) private couponModel: Model<CouponDocument>,
    @InjectModel(Banner.name) private bannerModel: Model<BannerDocument>,
  ) {}

  @Get()
  @ApiOperation({ summary: 'API health check with data status' })
  async check() {
    const now = Date.now()

    if (!this.countCache || this.countCache.expiresAt < now) {
      const [users, orders, coupons, banners] = await Promise.all([
        this.userModel.countDocuments(),
        this.orderModel.countDocuments(),
        this.couponModel.countDocuments(),
        this.bannerModel.countDocuments(),
      ])
      this.countCache = {
        data:      { users, orders, coupons, banners },
        expiresAt: now + 30_000,
      }
    }

    return successResponse({
      status:      'ok',
      uptime:      process.uptime().toFixed(2) + 's',
      timestamp:   new Date().toISOString(),
      version:     '1.0.0',
      environment: process.env.NODE_ENV ?? 'development',
      dataLoaded: {
        products:   this.productsService.products.length,
        categories: this.categoriesService.categories.length,
        ...this.countCache.data,
      },
      memory: {
        heapUsed:  (process.memoryUsage().heapUsed  / 1024 / 1024).toFixed(2) + ' MB',
        heapTotal: (process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2) + ' MB',
      },
    })
  }
}
