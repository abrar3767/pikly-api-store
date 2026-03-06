import {
  Controller, Post, Get, Patch,
  Body, Param, Query, UseGuards, Request,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger'
import { AuthGuard }    from '@nestjs/passport'
import { OrdersService }  from './orders.service'
import { CreateOrderDto } from './dto/create-order.dto'
import { successResponse } from '../common/api-utils'

// Every route requires a valid JWT. userId is always derived from req.user.userId
// (the verified token payload) — never from a query param or request body.
// This prevents one user from reading or cancelling another user's orders.
@ApiTags('Orders')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('create')
  @ApiOperation({ summary: 'Create order from cart (requires auth)' })
  async create(@Request() req: any, @Body() dto: CreateOrderDto) {
    const data = await this.ordersService.createOrder(req.user.userId, dto)
    return successResponse(data)
  }

  @Get()
  @ApiOperation({ summary: 'Get all orders for the authenticated user' })
  @ApiQuery({ name: 'page',   required: false })
  @ApiQuery({ name: 'limit',  required: false })
  @ApiQuery({ name: 'status', required: false, description: 'pending | confirmed | processing | shipped | delivered | cancelled' })
  async getUserOrders(
    @Request() req: any,
    @Query('page')   page?:   number,
    @Query('limit')  limit?:  number,
    @Query('status') status?: string,
  ) {
    const data = await this.ordersService.getUserOrders(req.user.userId, { page, limit, status })
    return successResponse(data)
  }

  @Get(':orderId')
  @ApiOperation({ summary: 'Get single order details (only your own orders)' })
  @ApiParam({ name: 'orderId' })
  async getOrder(@Request() req: any, @Param('orderId') orderId: string) {
    const data = await this.ordersService.getOrder(orderId, req.user.userId)
    return successResponse(data)
  }

  @Patch(':orderId/cancel')
  @ApiOperation({ summary: 'Cancel an order (only pending/confirmed, only your own)' })
  @ApiParam({ name: 'orderId' })
  async cancelOrder(@Request() req: any, @Param('orderId') orderId: string) {
    const data = await this.ordersService.cancelOrder(orderId, req.user.userId)
    return successResponse(data)
  }

  @Get(':orderId/track')
  @ApiOperation({ summary: 'Track order status with timeline (only your own orders)' })
  @ApiParam({ name: 'orderId' })
  async trackOrder(@Request() req: any, @Param('orderId') orderId: string) {
    const data = await this.ordersService.trackOrder(orderId, req.user.userId)
    return successResponse(data)
  }
}
