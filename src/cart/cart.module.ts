import { Module }         from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { CartController } from './cart.controller'
import { CartService }    from './cart.service'
import { Cart,   CartSchema   } from '../database/cart.schema'
import { Coupon, CouponSchema } from '../database/coupon.schema'
import { ProductsModule }       from '../products/products.module'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Cart.name,   schema: CartSchema   },
      { name: Coupon.name, schema: CouponSchema },
    ]),
    ProductsModule,
  ],
  controllers: [CartController],
  providers:   [CartService],
  exports:     [CartService],
})
export class CartModule {}
