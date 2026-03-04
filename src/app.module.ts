import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { MongooseModule } from "@nestjs/mongoose";
import { ProductsModule } from "./products/products.module";
import { CategoriesModule } from "./categories/categories.module";
import { CartModule } from "./cart/cart.module";
import { WishlistModule } from "./wishlist/wishlist.module";
import { OrdersModule } from "./orders/orders.module";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { HomepageModule } from "./homepage/homepage.module";
import { ImagesModule } from "./images/images.module";
import { CompareModule } from "./compare/compare.module";
import { CouponsModule } from "./coupons/coupons.module";
import { RecentlyViewedModule } from "./recently-viewed/recently-viewed.module";
import { HealthModule } from "./health/health.module";
import { CategoryShowcaseModule } from "./category-showcase/category-showcase.module";

@Module({
  imports: [
    // ── MongoDB connection ─────────────────────────────────────────────────
    MongooseModule.forRootAsync({
      useFactory: () => ({
        uri: process.env.MONGODB_URI,
      }),
    }),

    // ── Rate limiting ──────────────────────────────────────────────────────
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),

    // ── Feature modules ────────────────────────────────────────────────────
    ProductsModule,
    CategoriesModule,
    CartModule,
    WishlistModule,
    OrdersModule,
    AuthModule,
    UsersModule,
    HomepageModule,
    ImagesModule,
    CompareModule,
    CouponsModule,
    RecentlyViewedModule,
    HealthModule,
    CategoryShowcaseModule,
  ],
})
export class AppModule {}
