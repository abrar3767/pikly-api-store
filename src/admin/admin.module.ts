import { Module }         from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { AdminOrdersController }    from './admin-orders.controller'
import { AdminUsersController }     from './admin-users.controller'
import { AdminCouponsController }   from './admin-coupons.controller'
import { AdminBannersController }   from './admin-banners.controller'
import { AdminProductsController }  from './admin-products.controller'
import { AdminCategoriesController } from './admin-categories.controller'
import { AdminAnalyticsController } from './admin-analytics.controller'
import { AdminBulkController }      from './admin-bulk.controller'
import { Order,  OrderSchema  } from '../database/order.schema'
import { User,   UserSchema   } from '../database/user.schema'
import { Coupon, CouponSchema } from '../database/coupon.schema'
import { ProductsModule }   from '../products/products.module'
import { CategoriesModule } from '../categories/categories.module'
import { HomepageModule }   from '../homepage/homepage.module'
import { WebhookModule }    from '../webhooks/webhook.module'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name,  schema: OrderSchema  },
      { name: User.name,   schema: UserSchema   },
      { name: Coupon.name, schema: CouponSchema },
    ]),
    ProductsModule,
    CategoriesModule,
    HomepageModule,
    WebhookModule,  // required by AdminOrdersController (shipping webhook + email)
  ],
  controllers: [
    AdminOrdersController,
    AdminUsersController,
    AdminCouponsController,
    AdminBannersController,
    AdminProductsController,
    AdminCategoriesController,
    AdminAnalyticsController,
    AdminBulkController,
  ],
})
export class AdminModule {}
