import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
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
import { Coupon, CouponDocument } from "../../database/coupon.schema";
import { successResponse } from "../../common/api-utils";

// Coupons are the primary thing an admin needs to create and manage day-to-day.
// This controller owns the full lifecycle: create, edit, activate, deactivate,
// and delete. Once a coupon is created here it is immediately live because
// CartService reads from the CouponModel directly (no restart required).

@ApiTags("Admin — Coupons")
@ApiBearerAuth()
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles("admin")
@Controller("admin/coupons")
export class AdminCouponsController {
  constructor(
    @InjectModel(Coupon.name) private couponModel: Model<CouponDocument>,
  ) {}

  // ── GET /admin/coupons — list all coupons including inactive ──────────────
  @Get()
  @ApiOperation({
    summary: "[Admin] List all coupons (including inactive and expired)",
  })
  @ApiQuery({ name: "isActive", required: false, description: "true | false" })
  async findAll(@Query("isActive") isActive?: string) {
    const filter: any = {};
    if (isActive !== undefined) filter.isActive = isActive === "true";
    const coupons = await this.couponModel
      .find(filter)
      .sort({ createdAt: -1 })
      .lean();
    return successResponse(coupons);
  }

  // ── POST /admin/coupons — create a new coupon ─────────────────────────────
  // Required body fields: code, type, value, expiresAt
  // Optional: minOrderAmount, maxDiscount, usageLimit, applicableCategories, applicableProducts
  @Post()
  @ApiOperation({ summary: "[Admin] Create a new coupon" })
  async create(@Body() body: any) {
    // Auto-generate a stable id from the code so it is predictable and readable
    const id = `coup_${body.code?.toLowerCase().replace(/[^a-z0-9]/g, "_")}_${Date.now()}`;

    const existing = await this.couponModel.findOne({
      code: body.code?.toUpperCase(),
    });
    if (existing)
      return successResponse(null, {
        message: `Coupon code "${body.code}" already exists`,
      });

    const coupon = await this.couponModel.create({
      id,
      code: body.code?.toUpperCase(),
      type: body.type,
      value: body.value,
      minOrderAmount: body.minOrderAmount ?? 0,
      maxDiscount: body.maxDiscount ?? null,
      usageLimit: body.usageLimit ?? 1000,
      usedCount: 0,
      applicableCategories: body.applicableCategories ?? [],
      applicableProducts: body.applicableProducts ?? [],
      expiresAt: body.expiresAt,
      isActive: body.isActive ?? true,
    });

    return successResponse(coupon);
  }

  // ── PATCH /admin/coupons/:code — update coupon by code ───────────────────
  @Patch(":code")
  @ApiOperation({
    summary: "[Admin] Update a coupon by its code (e.g. SAVE10)",
  })
  @ApiParam({ name: "code", description: "Coupon code e.g. SAVE10" })
  async update(@Param("code") code: string, @Body() body: any) {
    // Never allow the usedCount to be manually lowered — that would enable
    // usage limit bypass by simply resetting the counter.
    const { usedCount, id, code: _code, ...safeBody } = body;
    const coupon = await this.couponModel.findOneAndUpdate(
      { code: code.toUpperCase() },
      { $set: safeBody },
      { new: true },
    );
    if (!coupon)
      return successResponse(null, { message: `Coupon "${code}" not found` });
    return successResponse(coupon);
  }

  // ── PATCH /admin/coupons/:code/toggle — flip isActive ────────────────────
  @Patch(":code/toggle")
  @ApiOperation({ summary: "[Admin] Toggle coupon active/inactive status" })
  @ApiParam({ name: "code" })
  async toggle(@Param("code") code: string) {
    const coupon = await this.couponModel.findOne({ code: code.toUpperCase() });
    if (!coupon)
      return successResponse(null, { message: `Coupon "${code}" not found` });
    coupon.isActive = !coupon.isActive;
    await coupon.save();
    return successResponse(coupon);
  }

  // ── DELETE /admin/coupons/:code — permanently delete ─────────────────────
  @Delete(":code")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "[Admin] Delete a coupon permanently" })
  @ApiParam({ name: "code" })
  async remove(@Param("code") code: string) {
    const coupon = await this.couponModel.findOneAndDelete({
      code: code.toUpperCase(),
    });
    if (!coupon)
      return successResponse(null, { message: `Coupon "${code}" not found` });
    return successResponse({ deleted: true, code: code.toUpperCase() });
  }
}
