import { Module }         from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { OrdersController } from './orders.controller'
import { OrdersService }    from './orders.service'
import { Order, OrderSchema } from '../database/order.schema'
import { User,  UserSchema  } from '../database/user.schema'
import { CartModule }         from '../cart/cart.module'
import { ProductsModule }     from '../products/products.module'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: User.name,  schema: UserSchema  },
    ]),
    CartModule,
    ProductsModule,
  ],
  controllers: [OrdersController],
  providers:   [OrdersService],
  exports:     [OrdersService],
})
export class OrdersModule {}
