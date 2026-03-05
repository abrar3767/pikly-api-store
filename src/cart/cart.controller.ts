import { Controller, Get, Post, Patch, Delete, Body, Query } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger'
import { CartService } from './cart.service'
import { successResponse } from '../common/api-utils'
import { AddToCartDto, UpdateCartDto, RemoveFromCartDto, ApplyCouponDto, MergeCartDto } from './dto/cart.dto'

@ApiTags('Cart')
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  @ApiOperation({ summary: 'Get cart by sessionId' })
  @ApiQuery({ name: 'sessionId', required: true })
  getCart(@Query('sessionId') sessionId: string) {
    return successResponse(this.cartService.getCart(sessionId))
  }

  @Post('add')
  @ApiOperation({ summary: 'Add item to cart' })
  addItem(@Body() dto: AddToCartDto) {
    return successResponse(this.cartService.addItem(dto))
  }

  @Patch('update')
  @ApiOperation({ summary: 'Update item quantity (0 = remove)' })
  updateItem(@Body() dto: UpdateCartDto) {
    return successResponse(this.cartService.updateItem(dto))
  }

  @Delete('remove')
  @ApiOperation({ summary: 'Remove item from cart' })
  removeItem(@Body() dto: RemoveFromCartDto) {
    return successResponse(this.cartService.removeItem(dto))
  }

  @Post('apply-coupon')
  @ApiOperation({ summary: 'Apply coupon code to cart' })
  applyCoupon(@Body() dto: ApplyCouponDto) {
    return successResponse(this.cartService.applyCoupon(dto))
  }

  @Delete('remove-coupon')
  @ApiOperation({ summary: 'Remove applied coupon from cart' })
  @ApiQuery({ name: 'sessionId', required: true })
  removeCoupon(@Query('sessionId') sessionId: string) {
    return successResponse(this.cartService.removeCoupon(sessionId))
  }

  @Post('merge')
  @ApiOperation({ summary: 'Merge guest cart into user cart after login' })
  mergeCart(@Body() dto: MergeCartDto) {
    return successResponse(this.cartService.mergeCart(dto))
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get lightweight cart summary (item count + total)' })
  @ApiQuery({ name: 'sessionId', required: true })
  getSummary(@Query('sessionId') sessionId: string) {
    return successResponse(this.cartService.getSummary(sessionId))
  }
}
