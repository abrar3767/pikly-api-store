import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { HealthController } from "./health.controller";
import { ProductsModule } from "../products/products.module";
import { CategoriesModule } from "../categories/categories.module";
import { User, UserSchema } from "../database/user.schema";
import { Order, OrderSchema } from "../database/order.schema";
import { Coupon, CouponSchema } from "../database/coupon.schema";
import { Banner, BannerSchema } from "../database/banner.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Order.name, schema: OrderSchema },
      { name: Coupon.name, schema: CouponSchema },
      { name: Banner.name, schema: BannerSchema },
    ]),
    ProductsModule,
    CategoriesModule,
  ],
  controllers: [HealthController],
})
export class HealthModule {}
