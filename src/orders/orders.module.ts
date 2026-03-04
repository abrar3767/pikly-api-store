import { Module } from '@nestjs/common'
import { OrdersController } from './orders.controller'
import { OrdersService }    from './orders.service'
import { CartModule }       from '../cart/cart.module'

@Module({
  imports:     [CartModule],
  controllers: [OrdersController],
  providers:   [OrdersService],
})
export class OrdersModule {}
