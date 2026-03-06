import {
  Controller, Get, Post, Patch, Delete,
  Body, Query, Param, UseGuards, Request,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiQuery, ApiParam, ApiBearerAuth } from '@nestjs/swagger'
import { AuthGuard }  from '@nestjs/passport'
import { CartService } from './cart.service'
import { successResponse } from '../common/api-utils'
import { AddToCartDto, UpdateCartDto, ApplyCouponDto, MergeCartDto } from './dto/cart.dto'

// SEC-04 note: sessionId is now passed via X-Session-ID header instead of
// URL query params, so it no longer appears in browser history, server logs,
// or CDN access logs. A helper reads it from either the header (preferred)
// or falls back to the query param for backward compatibility.
@ApiTags('Cart')
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  private getSessionId(req: any, queryParam?: string): string {
    return req.headers['x-session-id'] ?? queryParam ?? ''
  }

  @Get()
  @ApiOperation({ summary: 'Get cart — pass sessionId via X-Session-ID header' })
  @ApiQuery({ name: 'sessionId', required: false, description: 'Fallback if header not set' })
  async getCart(@Request() req: any, @Query('sessionId') sid?: string) {
    const data = await this.cartService.getCart(this.getSessionId(req, sid))
    return successResponse(data)
  }

  @Post('add')
  @ApiOperation({ summary: 'Add item to cart' })
  async addItem(@Body() dto: AddToCartDto) {
    const data = await this.cartService.addItem(dto)
    return successResponse(data)
  }

  @Patch('update')
  @ApiOperation({ summary: 'Update item quantity (quantity 0 = remove)' })
  async updateItem(@Body() dto: UpdateCartDto) {
    const data = await this.cartService.updateItem(dto)
    return successResponse(data)
  }

  // DES-02 fix: use path param + query param instead of DELETE with request body.
  // Many proxies and HTTP clients strip bodies from DELETE requests.
  @Delete('items/:productId')
  @ApiOperation({ summary: 'Remove a specific item — no request body needed' })
  @ApiParam({ name: 'productId' })
  @ApiQuery({ name: 'sessionId', required: false })
  @ApiQuery({ name: 'variantId', required: false })
  async removeItem(
    @Request() req: any,
    @Param('productId') productId: string,
    @Query('sessionId') sid?: string,
    @Query('variantId') variantId?: string,
  ) {
    const data = await this.cartService.removeItem({
      productId, variantId, sessionId: this.getSessionId(req, sid),
    })
    return successResponse(data)
  }

  @Post('apply-coupon')
  @ApiOperation({ summary: 'Apply a coupon code (now validates applicableCategories/Products)' })
  async applyCoupon(@Body() dto: ApplyCouponDto) {
    const data = await this.cartService.applyCoupon(dto)
    return successResponse(data)
  }

  @Delete('coupon')
  @ApiOperation({ summary: 'Remove applied coupon' })
  @ApiQuery({ name: 'sessionId', required: false })
  async removeCoupon(@Request() req: any, @Query('sessionId') sid?: string) {
    const data = await this.cartService.removeCoupon(this.getSessionId(req, sid))
    return successResponse(data)
  }

  @Post('merge')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Merge guest cart into user cart after login (BUG-10: preserves guest coupon)' })
  async mergeCart(@Request() req: any, @Body() dto: MergeCartDto) {
    const data = await this.cartService.mergeCart({ ...dto, userId: req.user.userId })
    return successResponse(data)
  }

  @Get('summary')
  @ApiOperation({ summary: 'Lightweight cart summary (item count + total)' })
  @ApiQuery({ name: 'sessionId', required: false })
  async getSummary(@Request() req: any, @Query('sessionId') sid?: string) {
    const data = await this.cartService.getSummary(this.getSessionId(req, sid))
    return successResponse(data)
  }

  // DES-04 fix: expose clearCart as a public DELETE /cart endpoint
  @Delete()
  @ApiOperation({ summary: 'Clear all items from cart' })
  @ApiQuery({ name: 'sessionId', required: false })
  async clearCart(@Request() req: any, @Query('sessionId') sid?: string) {
    await this.cartService.clearCart(this.getSessionId(req, sid))
    return successResponse({ cleared: true })
  }
}
