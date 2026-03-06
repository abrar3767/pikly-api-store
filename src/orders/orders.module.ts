import { Module }         from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { OrdersController } from './orders.controller'
import { OrdersService }    from './orders.service'
import { Order,   OrderSchema   } from '../database/order.schema'
import { User,    UserSchema    } from '../database/user.schema'
import { Coupon,  CouponSchema  } from '../database/coupon.schema'
import { Counter, CounterSchema } from '../database/counter.schema'
import { CartModule }    from '../cart/cart.module'
import { ProductsModule } from '../products/products.module'
import { WebhookModule }  from '../webhooks/webhook.module'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name,   schema: OrderSchema   },
      { name: User.name,    schema: UserSchema    },
      { name: Coupon.name,  schema: CouponSchema  },
      { name: Counter.name, schema: CounterSchema },
    ]),
    CartModule,
    ProductsModule,
    WebhookModule,   // FEAT-05: needed so OrdersService can fire webhook events
  ],
  controllers: [OrdersController],
  providers:   [OrdersService],
  exports:     [OrdersService],
})
export class OrdersModule {}
