import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { MongooseModule } from "@nestjs/mongoose";

// ── Feature modules ────────────────────────────────────────────────────────
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { ProductsModule } from "./products/products.module";
import { CategoriesModule } from "./categories/categories.module";
import { CartModule } from "./cart/cart.module";
import { WishlistModule } from "./wishlist/wishlist.module";
import { OrdersModule } from "./orders/orders.module";
import { HomepageModule } from "./homepage/homepage.module";
import { ImagesModule } from "./images/images.module";
import { CompareModule } from "./compare/compare.module";
import { CouponsModule } from "./coupons/coupons.module";
import { RecentlyViewedModule } from "./recently-viewed/recently-viewed.module";
import { HealthModule } from "./health/health.module";
import { CategoryShowcaseModule } from "./category-showcase/category-showcase.module";

// ── Admin module ───────────────────────────────────────────────────────────
// AdminModule registers all /admin/* controllers and reuses the exported
// services from ProductsModule, CategoriesModule, and HomepageModule.
// It must come after those three modules in the imports array so NestJS
// resolves the exported providers before AdminModule consumes them.
import { AdminModule } from "./admin/admin.module";

@Module({
  imports: [
    // ── Database connection ──────────────────────────────────────────────
    MongooseModule.forRootAsync({
      useFactory: () => ({ uri: process.env.MONGODB_URI }),
    }),

    // ── Rate limiting — 100 requests per 60 seconds per IP ──────────────
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),

    // ── Core feature modules ─────────────────────────────────────────────
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

    // ── Admin — must come after ProductsModule, CategoriesModule, HomepageModule
    AdminModule,
  ],
})
export class AppModule {}
