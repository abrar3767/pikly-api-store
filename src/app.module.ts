import { Module }         from '@nestjs/common'
import { ThrottlerModule } from '@nestjs/throttler'
import { MongooseModule } from '@nestjs/mongoose'
import { ProductsModule }       from './products/products.module'
import { CategoriesModule }     from './categories/categories.module'
import { CartModule }           from './cart/cart.module'
import { WishlistModule }       from './wishlist/wishlist.module'
import { OrdersModule }         from './orders/orders.module'
import { AuthModule }           from './auth/auth.module'
import { UsersModule }          from './users/users.module'
import { HomepageModule }       from './homepage/homepage.module'
import { ImagesModule }         from './images/images.module'
import { CompareModule }        from './compare/compare.module'
import { CouponsModule }        from './coupons/coupons.module'
import { RecentlyViewedModule } from './recently-viewed/recently-viewed.module'
import { HealthModule }         from './health/health.module'
import { CategoryShowcaseModule } from './category-showcase/category-showcase.module'
import { CacheModule } from './common/cache.module'
import { AdminModule }          from './admin/admin.module'

@Module({
  imports: [
    MongooseModule.forRootAsync({
      useFactory: () => ({
        uri: process.env.MONGODB_URI,
      }),
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    CacheModule,
    AuthModule,
    UsersModule,
    ProductsModule,
    CategoriesModule,
    CartModule,
    WishlistModule,
    OrdersModule,
    HomepageModule,
    ImagesModule,
    CompareModule,
    CouponsModule,
    RecentlyViewedModule,
    HealthModule,
    CategoryShowcaseModule,
    AdminModule,
  ],
})
export class AppModule {}
