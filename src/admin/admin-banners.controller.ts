import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
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
} from "@nestjs/swagger";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { HomepageService } from "../../homepage/homepage.service";
import { successResponse } from "../../common/api-utils";

// AdminBannersController delegates to HomepageService for all banner operations
// because HomepageService owns the BannerModel and also owns the homepage cache.
// When a banner is created, updated or deleted, HomepageService.invalidate() is
// called internally — so the homepage cache is always consistent without any
// extra work here.

@ApiTags("Admin — Banners")
@ApiBearerAuth()
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles("admin")
@Controller("admin/banners")
export class AdminBannersController {
  constructor(private readonly homepageService: HomepageService) {}

  // ── GET /admin/banners — all banners including inactive and expired ────────
  @Get()
  @ApiOperation({
    summary: "[Admin] List all banners (including inactive and expired)",
  })
  async findAll() {
    return successResponse(await this.homepageService.adminGetBanners());
  }

  // ── POST /admin/banners — create a new banner ─────────────────────────────
  // Required: title, position
  // Recommended: image, ctaText, ctaLink, startDate, endDate, sortOrder
  @Post()
  @ApiOperation({ summary: "[Admin] Create a new banner" })
  async create(@Body() body: any) {
    const id = `ban_${Date.now()}`;
    return successResponse(
      await this.homepageService.adminCreateBanner({
        id,
        title: body.title,
        subtitle: body.subtitle ?? "",
        image: body.image ?? null,
        ctaText: body.ctaText ?? "",
        ctaLink: body.ctaLink ?? "",
        position: body.position ?? "hero",
        startDate: body.startDate ?? new Date().toISOString(),
        endDate:
          body.endDate ?? new Date(Date.now() + 365 * 86_400_000).toISOString(),
        isActive: body.isActive ?? true,
        sortOrder: body.sortOrder ?? 99,
      }),
    );
  }

  // ── PATCH /admin/banners/:id — update any banner fields ──────────────────
  @Patch(":id")
  @ApiOperation({ summary: "[Admin] Update a banner by its id field" })
  @ApiParam({ name: "id", description: "Banner id field e.g. ban_001" })
  async update(@Param("id") id: string, @Body() body: any) {
    return successResponse(
      await this.homepageService.adminUpdateBanner(id, body),
    );
  }

  // ── PATCH /admin/banners/:id/toggle — flip isActive ──────────────────────
  @Patch(":id/toggle")
  @ApiOperation({ summary: "[Admin] Toggle banner active/inactive status" })
  @ApiParam({ name: "id" })
  async toggle(@Param("id") id: string) {
    const banners = await this.homepageService.adminGetBanners();
    const banner = banners.find((b: any) => b.id === id) as any;
    if (!banner)
      return successResponse(null, { message: `Banner "${id}" not found` });
    return successResponse(
      await this.homepageService.adminUpdateBanner(id, {
        isActive: !banner.isActive,
      }),
    );
  }

  // ── DELETE /admin/banners/:id — permanently delete ────────────────────────
  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "[Admin] Delete a banner permanently" })
  @ApiParam({ name: "id" })
  async remove(@Param("id") id: string) {
    return successResponse(await this.homepageService.adminDeleteBanner(id));
  }
}
