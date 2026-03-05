import {
  Controller,
  Post,
  Get,
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
import { RecentlyViewedService } from "./recently-viewed.service";
import { successResponse } from "../common/api-utils";

// FIX BUG#3: guard at class level — all recently-viewed endpoints require JWT
@ApiTags("Recently Viewed")
@ApiBearerAuth()
@UseGuards(AuthGuard("jwt"))
@Controller("recently-viewed")
export class RecentlyViewedController {
  constructor(private readonly recentlyViewedService: RecentlyViewedService) {}

  @Post()
  @ApiOperation({ summary: "Track a product view" })
  // FIX BUG#2 + BUG#3: async/await + userId from JWT, not from request body
  async track(@Request() req: any, @Body() body: { productId: string }) {
    return successResponse(
      await this.recentlyViewedService.track(req.user.userId, body.productId),
    );
  }

  @Get()
  @ApiOperation({
    summary:
      "Get my recently viewed products — supports offset (page) and cursor pagination",
  })
  @ApiQuery({
    name: "page",
    required: false,
    description: "Page number — use either page OR cursor, not both",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    description: "Items per page (default: 10, max: 20)",
  })
  @ApiQuery({
    name: "cursor",
    required: false,
    description: "Cursor from previous response for cursor pagination",
  })
  async getRecent(
    @Request() req: any,
    @Query("page") page?: number,
    @Query("limit") limit?: number,
    @Query("cursor") cursor?: string,
  ) {
    return successResponse(
      await this.recentlyViewedService.getRecent(req.user.userId, {
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        cursor: cursor ?? undefined,
      }),
    );
  }
}
