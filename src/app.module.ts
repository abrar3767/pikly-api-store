import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'
import { MongooseModule } from '@nestjs/mongoose'
import { RedisModule } from './redis/redis.module'
import { MailModule } from './mail/mail.module'
import { ProductsModule } from './products/products.module'
import { CategoriesModule } from './categories/categories.module'
import { CartModule } from './cart/cart.module'
import { WishlistModule } from './wishlist/wishlist.module'
import { OrdersModule } from './orders/orders.module'
import { AuthModule } from './auth/auth.module'
import { UsersModule } from './users/users.module'
import { HomepageModule } from './homepage/homepage.module'
import { ImagesModule } from './images/images.module'
import { CompareModule } from './compare/compare.module'
import { CouponsModule } from './coupons/coupons.module'
import { RecentlyViewedModule } from './recently-viewed/recently-viewed.module'
import { HealthModule } from './health/health.module'
import { CategoryShowcaseModule } from './category-showcase/category-showcase.module'
import { CacheModule } from './common/cache.module'
import { AdminModule } from './admin/admin.module'
import { WebhookModule } from './webhooks/webhook.module'
import { UploadsModule } from './uploads/uploads.module'

@Module({
  imports: [
    MongooseModule.forRootAsync({
      useFactory: () => ({ uri: process.env.MONGODB_URI }),
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    // @Global() modules — available everywhere without importing
    RedisModule,
    MailModule,
    CacheModule,
    // Feature modules
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
    WebhookModule,
    UploadsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
