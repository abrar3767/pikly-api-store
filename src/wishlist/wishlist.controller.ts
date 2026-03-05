import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Request,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { AuthGuard } from "@nestjs/passport";
import { WishlistService } from "./wishlist.service";
import { successResponse } from "../common/api-utils";

// FIX BUG#3: guard at class level — all wishlist endpoints require JWT
@ApiTags("Wishlist")
@ApiBearerAuth()
@UseGuards(AuthGuard("jwt"))
@Controller("wishlist")
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Get()
  @ApiOperation({ summary: "Get my wishlist" })
  // FIX BUG#2 + BUG#3: async/await + userId from JWT, not from query string
  async getWishlist(@Request() req: any) {
    return successResponse(
      await this.wishlistService.getWishlist(req.user.userId),
    );
  }

  @Post("toggle")
  @ApiOperation({ summary: "Add or remove product from my wishlist" })
  async toggle(@Request() req: any, @Body() body: { productId: string }) {
    return successResponse(
      await this.wishlistService.toggle(req.user.userId, body.productId),
    );
  }

  @Get("check")
  @ApiOperation({ summary: "Check if product is in my wishlist" })
  @ApiQuery({ name: "productId", required: true })
  async check(@Request() req: any, @Query("productId") productId: string) {
    return successResponse(
      await this.wishlistService.check(req.user.userId, productId),
    );
  }
}
