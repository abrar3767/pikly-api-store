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
import { ProductsService } from "../../products/products.service";
import { successResponse } from "../../common/api-utils";

// All endpoints here require a valid JWT token (AuthGuard) AND the 'admin'
// role (RolesGuard). A request that passes JWT but has role:'customer' will
// receive a 403 Forbidden from RolesGuard before reaching any handler.

@ApiTags("Admin — Products")
@ApiBearerAuth()
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles("admin")
@Controller("admin/products")
export class AdminProductsController {
  constructor(private readonly productsService: ProductsService) {}

  // ── GET /admin/products — paginated list, supports search and isActive filter
  @Get()
  @ApiOperation({
    summary: "[Admin] List all products with search and pagination",
  })
  @ApiQuery({ name: "page", required: false })
  @ApiQuery({ name: "limit", required: false })
  @ApiQuery({
    name: "search",
    required: false,
    description: "Search by title, brand, category",
  })
  @ApiQuery({
    name: "isActive",
    required: false,
    description: "true | false — filter by active status",
  })
  async findAll(
    @Query("page") page?: number,
    @Query("limit") limit?: number,
    @Query("search") search?: string,
    @Query("isActive") isActive?: string,
  ) {
    const filter = {
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      search,
      isActive: isActive !== undefined ? isActive === "true" : undefined,
    };
    return successResponse(await this.productsService.adminFindAll(filter));
  }

  // ── POST /admin/products — create a new product
  @Post()
  @ApiOperation({ summary: "[Admin] Create a new product" })
  async create(@Body() body: any) {
    return successResponse(await this.productsService.adminCreate(body));
  }

  // ── PATCH /admin/products/:id — update any fields on an existing product
  @Patch(":id")
  @ApiOperation({
    summary: "[Admin] Update product by id field (not MongoDB _id)",
  })
  @ApiParam({ name: "id", description: "Product id field e.g. prod_0001" })
  async update(@Param("id") id: string, @Body() body: any) {
    return successResponse(await this.productsService.adminUpdate(id, body));
  }

  // ── PATCH /admin/products/:id/toggle — flip isActive without a full body
  @Patch(":id/toggle")
  @ApiOperation({ summary: "[Admin] Toggle product active/inactive status" })
  @ApiParam({ name: "id" })
  async toggle(@Param("id") id: string) {
    // Read current state from in-memory array — avoids an extra DB read
    const current = this.productsService.products.find((p) => p.id === id);
    if (!current) return successResponse({ error: `Product ${id} not found` });
    return successResponse(
      await this.productsService.adminUpdate(id, {
        isActive: !current.isActive,
      }),
    );
  }

  // ── DELETE /admin/products/:id — permanently delete a product
  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "[Admin] Delete a product permanently" })
  @ApiParam({ name: "id" })
  async remove(@Param("id") id: string) {
    return successResponse(await this.productsService.adminDelete(id));
  }
}
