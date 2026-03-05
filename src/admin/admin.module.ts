import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";

// Controllers — same folder as this module (src/admin/)
import { AdminProductsController } from "./admin-products.controller";
import { AdminCategoriesController } from "./admin-categories.controller";
import { AdminOrdersController } from "./admin-orders.controller";
import { AdminUsersController } from "./admin-users.controller";
import { AdminCouponsController } from "./admin-coupons.controller";
import { AdminBannersController } from "./admin-banners.controller";

// Feature modules — services exported from these are injected into controllers
import { ProductsModule } from "../products/products.module";
import { CategoriesModule } from "../categories/categories.module";
import { HomepageModule } from "../homepage/homepage.module";

// Schemas used directly by admin controllers that bypass the service layer
import { User, UserSchema } from "../database/user.schema";
import { Order, OrderSchema } from "../database/order.schema";
import { Coupon, CouponSchema } from "../database/coupon.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Order.name, schema: OrderSchema },
      { name: Coupon.name, schema: CouponSchema },
    ]),
    ProductsModule,
    CategoriesModule,
    HomepageModule,
  ],
  controllers: [
    AdminProductsController,
    AdminCategoriesController,
    AdminOrdersController,
    AdminUsersController,
    AdminCouponsController,
    AdminBannersController,
  ],
})
export class AdminModule {}
