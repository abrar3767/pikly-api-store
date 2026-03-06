import {
  Controller, Get, Post, Patch, Delete,
  Body, Query, UseGuards, Request,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger'
import { AuthGuard }  from '@nestjs/passport'
import { CartService } from './cart.service'
import { successResponse } from '../common/api-utils'
import {
  AddToCartDto, UpdateCartDto, RemoveFromCartDto,
  ApplyCouponDto, MergeCartDto,
} from './dto/cart.dto'

// Cart supports both guest sessions (no auth required) and authenticated users.
// The only exception is the merge endpoint, which requires auth because it needs
// to know the real user ID to merge into — that ID must come from the JWT, not
// from a client-supplied field, to prevent one user from hijacking another's cart.
@ApiTags('Cart')
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  @ApiOperation({ summary: 'Get cart by sessionId (guest or user)' })
  @ApiQuery({ name: 'sessionId', required: true })
  async getCart(@Query('sessionId') sessionId: string) {
    const data = await this.cartService.getCart(sessionId)
    return successResponse(data)
  }

  @Post('add')
  @ApiOperation({ summary: 'Add item to cart' })
  async addItem(@Body() dto: AddToCartDto) {
    const data = await this.cartService.addItem(dto)
    return successResponse(data)
  }

  @Patch('update')
  @ApiOperation({ summary: 'Update item quantity (quantity 0 removes the item)' })
  async updateItem(@Body() dto: UpdateCartDto) {
    const data = await this.cartService.updateItem(dto)
    return successResponse(data)
  }

  @Delete('remove')
  @ApiOperation({ summary: 'Remove a specific item from the cart' })
  async removeItem(@Body() dto: RemoveFromCartDto) {
    const data = await this.cartService.removeItem(dto)
    return successResponse(data)
  }

  @Post('apply-coupon')
  @ApiOperation({ summary: 'Apply a coupon code to the cart' })
  async applyCoupon(@Body() dto: ApplyCouponDto) {
    const data = await this.cartService.applyCoupon(dto)
    return successResponse(data)
  }

  @Delete('remove-coupon')
  @ApiOperation({ summary: 'Remove the applied coupon from the cart' })
  @ApiQuery({ name: 'sessionId', required: true })
  async removeCoupon(@Query('sessionId') sessionId: string) {
    const data = await this.cartService.removeCoupon(sessionId)
    return successResponse(data)
  }

  // Merge requires auth: the userId is taken from the verified JWT so that a
  // user cannot merge another user's cart by passing a different userId.
  @Post('merge')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Merge a guest cart into the authenticated user\'s cart after login' })
  async mergeCart(@Request() req: any, @Body() dto: MergeCartDto) {
    const data = await this.cartService.mergeCart({ ...dto, userId: req.user.userId })
    return successResponse(data)
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get lightweight cart summary (item count + total only)' })
  @ApiQuery({ name: 'sessionId', required: true })
  async getSummary(@Query('sessionId') sessionId: string) {
    const data = await this.cartService.getSummary(sessionId)
    return successResponse(data)
  }
}
