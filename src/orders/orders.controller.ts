import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { AuthGuard } from "@nestjs/passport";
import { OrdersService } from "./orders.service";
import { CreateOrderDto } from "./dto/create-order.dto";
import { successResponse } from "../common/api-utils";

// FIX BUG#3: guard applied at class level — all order endpoints require JWT
@ApiTags("Orders")
@ApiBearerAuth()
@UseGuards(AuthGuard("jwt"))
@Controller("orders")
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post("create")
  @ApiOperation({ summary: "Create order from cart" })
  // FIX BUG#4: userId comes from verified JWT, not from request body
  // FIX BUG#2: async/await so Promise resolves before successResponse wraps it
  async create(@Body() dto: CreateOrderDto, @Request() req: any) {
    dto.userId = req.user.userId;
    return successResponse(await this.ordersService.createOrder(dto));
  }

  @Get()
  @ApiOperation({ summary: "Get my orders" })
  @ApiQuery({ name: "page", required: false })
  @ApiQuery({ name: "limit", required: false })
  @ApiQuery({ name: "cursor", required: false })
  @ApiQuery({
    name: "status",
    required: false,
    description:
      "pending | confirmed | processing | shipped | delivered | cancelled",
  })
  async getUserOrders(
    @Request() req: any,
    @Query("page") page?: number,
    @Query("limit") limit?: number,
    @Query("cursor") cursor?: string,
    @Query("status") status?: string,
  ) {
    return successResponse(
      await this.ordersService.getUserOrders(req.user.userId, {
        page,
        limit,
        cursor,
        status,
      }),
    );
  }

  @Get(":orderId")
  @ApiOperation({ summary: "Get single order details" })
  @ApiParam({ name: "orderId" })
  async getOrder(@Param("orderId") orderId: string) {
    return successResponse(await this.ordersService.getOrder(orderId));
  }

  @Patch(":orderId/cancel")
  @ApiOperation({ summary: "Cancel an order (only pending/confirmed)" })
  @ApiParam({ name: "orderId" })
  async cancelOrder(@Param("orderId") orderId: string) {
    return successResponse(await this.ordersService.cancelOrder(orderId));
  }

  @Get(":orderId/track")
  @ApiOperation({ summary: "Track order status with timeline" })
  @ApiParam({ name: "orderId" })
  async trackOrder(@Param("orderId") orderId: string) {
    return successResponse(await this.ordersService.trackOrder(orderId));
  }
}
