import { Controller, Post, Get, Body, Query } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiQuery } from "@nestjs/swagger";
import { RecentlyViewedService } from "./recently-viewed.service";
import { successResponse } from "../common/api-utils";

@ApiTags("Recently Viewed")
@Controller("recently-viewed")
export class RecentlyViewedController {
  constructor(private readonly recentlyViewedService: RecentlyViewedService) {}

  @Post()
  @ApiOperation({ summary: "Track a product view for a user" })
  track(@Body() body: { userId: string; productId: string }) {
    return successResponse(
      this.recentlyViewedService.track(body.userId, body.productId),
    );
  }

  @Get()
  @ApiOperation({
    summary:
      "Get recently viewed products — supports offset (page) and cursor pagination",
  })
  @ApiQuery({ name: "userId", required: true })
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
  getRecent(
    @Query("userId") userId: string,
    @Query("page") page?: number,
    @Query("limit") limit?: number,
    @Query("cursor") cursor?: string,
  ) {
    return successResponse(
      this.recentlyViewedService.getRecent(userId, {
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        cursor: cursor ?? undefined,
      }),
    );
  }
}
