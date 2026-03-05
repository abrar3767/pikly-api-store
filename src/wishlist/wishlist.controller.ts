import { Controller, Get, Post, Body, Query } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger'
import { WishlistService } from './wishlist.service'
import { successResponse }  from '../common/api-utils'

@ApiTags('Wishlist')
@Controller('wishlist')
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Get()
  @ApiOperation({ summary: 'Get wishlist for a user' })
  @ApiQuery({ name: 'userId', required: true })
  getWishlist(@Query('userId') userId: string) {
    return successResponse(this.wishlistService.getWishlist(userId))
  }

  @Post('toggle')
  @ApiOperation({ summary: 'Add or remove product from wishlist' })
  toggle(@Body() body: { userId: string; productId: string }) {
    return successResponse(this.wishlistService.toggle(body.userId, body.productId))
  }

  @Get('check')
  @ApiOperation({ summary: 'Check if product is in wishlist' })
  @ApiQuery({ name: 'userId',    required: true })
  @ApiQuery({ name: 'productId', required: true })
  check(@Query('userId') userId: string, @Query('productId') productId: string) {
    return successResponse(this.wishlistService.check(userId, productId))
  }
}
