import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
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
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CategoriesService } from "../../categories/categories.service";
import { successResponse } from "../../common/api-utils";

@ApiTags("Admin — Categories")
@ApiBearerAuth()
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles("admin")
@Controller("admin/categories")
export class AdminCategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  // ── GET /admin/categories — flat list of all categories (no tree building)
  @Get()
  @ApiOperation({
    summary: "[Admin] List all categories (flat, includes inactive)",
  })
  @ApiQuery({ name: "isActive", required: false, description: "true | false" })
  findAll(@Query("isActive") isActive?: string) {
    let cats = this.categoriesService.categories;
    if (isActive !== undefined) {
      const active = isActive === "true";
      cats = cats.filter((c: any) => c.isActive === active);
    }
    return successResponse(cats);
  }

  // ── POST /admin/categories — create a new category
  @Post()
  @ApiOperation({ summary: "[Admin] Create a new category" })
  async create(@Body() body: any) {
    return successResponse(await this.categoriesService.adminCreate(body));
  }

  // ── PATCH /admin/categories/:id — update category fields
  @Patch(":id")
  @ApiOperation({ summary: "[Admin] Update category by id field" })
  @ApiParam({ name: "id", description: "Category id field e.g. cat_001" })
  async update(@Param("id") id: string, @Body() body: any) {
    return successResponse(await this.categoriesService.adminUpdate(id, body));
  }

  // ── PATCH /admin/categories/:id/toggle — flip isActive
  @Patch(":id/toggle")
  @ApiOperation({ summary: "[Admin] Toggle category active/inactive status" })
  @ApiParam({ name: "id" })
  async toggle(@Param("id") id: string) {
    const current = this.categoriesService.categories.find(
      (c: any) => c.id === id,
    );
    if (!current) return successResponse({ error: `Category ${id} not found` });
    return successResponse(
      await this.categoriesService.adminUpdate(id, {
        isActive: !current.isActive,
      }),
    );
  }

  // ── DELETE /admin/categories/:id — permanently delete a category
  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "[Admin] Delete a category permanently" })
  @ApiParam({ name: "id" })
  async remove(@Param("id") id: string) {
    return successResponse(await this.categoriesService.adminDelete(id));
  }
}
