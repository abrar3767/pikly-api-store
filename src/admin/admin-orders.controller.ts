import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from "@nestjs/swagger";
import { AuthGuard } from "@nestjs/passport";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { Order, OrderDocument } from "../../database/order.schema";
import { successResponse } from "../../common/api-utils";

// Admin orders gives the admin team full visibility across ALL orders — not
// just their own. The customer-facing OrdersController at /api/orders only
// returns orders belonging to req.user.userId. Here we query without that
// userId constraint and additionally support status updates and tracking.

@ApiTags("Admin — Orders")
@ApiBearerAuth()
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles("admin")
@Controller("admin/orders")
export class AdminOrdersController {
  constructor(
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
  ) {}

  // ── GET /admin/orders — all orders across all users, with filters ─────────
  @Get()
  @ApiOperation({
    summary: "[Admin] List all orders with filters and pagination",
  })
  @ApiQuery({ name: "page", required: false })
  @ApiQuery({ name: "limit", required: false })
  @ApiQuery({
    name: "status",
    required: false,
    description:
      "pending | confirmed | processing | shipped | delivered | cancelled",
  })
  @ApiQuery({
    name: "userId",
    required: false,
    description: "Filter by specific user MongoDB _id",
  })
  @ApiQuery({
    name: "search",
    required: false,
    description: "Search by orderId",
  })
  async findAll(
    @Query("page") page?: number,
    @Query("limit") limit?: number,
    @Query("status") status?: string,
    @Query("userId") userId?: string,
    @Query("search") search?: string,
  ) {
    const filter: any = {};
    if (status) filter.status = status;
    if (userId) filter.userId = userId;
    if (search) filter.orderId = { $regex: search, $options: "i" };

    const p = Number(page ?? 1);
    const l = Number(limit ?? 20);
    const skip = (p - 1) * l;

    const [orders, total] = await Promise.all([
      this.orderModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(l)
        .lean(),
      this.orderModel.countDocuments(filter),
    ]);

    return successResponse({
      orders,
      pagination: {
        total,
        page: p,
        limit: l,
        totalPages: Math.ceil(total / l),
        hasNextPage: p * l < total,
      },
    });
  }

  // ── GET /admin/orders/stats — counts per status for dashboard ────────────
  @Get("stats")
  @ApiOperation({ summary: "[Admin] Get order count grouped by status" })
  async stats() {
    const pipeline = [
      { $group: { _id: "$status", count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ];
    const result = await this.orderModel.aggregate(pipeline);
    const stats: Record<string, number> = {};
    let total = 0;
    for (const row of result) {
      stats[row._id] = row.count;
      total += row.count;
    }
    return successResponse({ ...stats, total });
  }

  // ── GET /admin/orders/:orderId — single order detail ─────────────────────
  @Get(":orderId")
  @ApiOperation({
    summary: "[Admin] Get single order by orderId (e.g. ORD-2026-01001)",
  })
  @ApiParam({ name: "orderId" })
  async findOne(@Param("orderId") orderId: string) {
    const order = await this.orderModel.findOne({ orderId }).lean();
    if (!order)
      return successResponse(null, { message: `Order ${orderId} not found` });
    return successResponse(order);
  }

  // ── PATCH /admin/orders/:orderId/status — update order status ────────────
  @Patch(":orderId/status")
  @ApiOperation({
    summary: "[Admin] Update order status and append a timeline entry",
  })
  @ApiParam({ name: "orderId" })
  async updateStatus(
    @Param("orderId") orderId: string,
    @Body() body: { status: string; message?: string },
  ) {
    const validStatuses = [
      "pending",
      "confirmed",
      "processing",
      "shipped",
      "delivered",
      "cancelled",
    ];
    if (!validStatuses.includes(body.status)) {
      return successResponse(null, {
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    const order = await this.orderModel.findOne({ orderId });
    if (!order)
      return successResponse(null, { message: `Order ${orderId} not found` });

    const now = new Date().toISOString();
    const message = body.message ?? `Status updated to ${body.status} by admin`;

    order.status = body.status;
    if (body.status === "cancelled") order.paymentStatus = "refunded";
    if (body.status === "delivered") order.paymentStatus = "paid";
    order.timeline.push({ status: body.status, timestamp: now, message });
    await order.save();

    return successResponse(order);
  }

  // ── PATCH /admin/orders/:orderId/tracking — add tracking number ───────────
  @Patch(":orderId/tracking")
  @ApiOperation({
    summary: "[Admin] Set tracking number and mark order as shipped",
  })
  @ApiParam({ name: "orderId" })
  async addTracking(
    @Param("orderId") orderId: string,
    @Body() body: { trackingNumber: string; estimatedDelivery?: string },
  ) {
    const order = await this.orderModel.findOne({ orderId });
    if (!order)
      return successResponse(null, { message: `Order ${orderId} not found` });

    const now = new Date().toISOString();
    order.trackingNumber = body.trackingNumber;
    order.estimatedDelivery = body.estimatedDelivery ?? order.estimatedDelivery;
    if (order.status !== "shipped" && order.status !== "delivered") {
      order.status = "shipped";
      order.timeline.push({
        status: "shipped",
        timestamp: now,
        message: `Shipped with tracking number ${body.trackingNumber}`,
      });
    }
    await order.save();

    return successResponse(order);
  }
}
