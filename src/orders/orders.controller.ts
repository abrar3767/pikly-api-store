import { Controller, Post, Get, Patch, Body, Param, Query } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger'
import { OrdersService }   from './orders.service'
import { CreateOrderDto }  from './dto/create-order.dto'
import { successResponse } from '../common/api-utils'

@ApiTags('Orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('create')
  @ApiOperation({ summary: 'Create order from cart' })
  create(@Body() dto: CreateOrderDto) {
    return successResponse(this.ordersService.createOrder(dto))
  }

  @Get()
  @ApiOperation({ summary: 'Get all orders for a user' })
  @ApiQuery({ name: 'userId', required: true })
  @ApiQuery({ name: 'page',   required: false })
  @ApiQuery({ name: 'limit',  required: false })
  @ApiQuery({ name: 'status', required: false, description: 'pending | confirmed | processing | shipped | delivered | cancelled' })
  getUserOrders(
    @Query('userId') userId: string,
    @Query('page')   page?:  number,
    @Query('limit')  limit?: number,
    @Query('status') status?: string,
  ) {
    return successResponse(this.ordersService.getUserOrders(userId, { page, limit, status }))
  }

  @Get(':orderId')
  @ApiOperation({ summary: 'Get single order details' })
  @ApiParam({ name: 'orderId' })
  getOrder(@Param('orderId') orderId: string) {
    return successResponse(this.ordersService.getOrder(orderId))
  }

  @Patch(':orderId/cancel')
  @ApiOperation({ summary: 'Cancel an order (only pending/confirmed)' })
  @ApiParam({ name: 'orderId' })
  cancelOrder(@Param('orderId') orderId: string) {
    return successResponse(this.ordersService.cancelOrder(orderId))
  }

  @Get(':orderId/track')
  @ApiOperation({ summary: 'Track order status with timeline' })
  @ApiParam({ name: 'orderId' })
  trackOrder(@Param('orderId') orderId: string) {
    return successResponse(this.ordersService.trackOrder(orderId))
  }
}
