import {
  Controller,
  Get,
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
import { User, UserDocument } from "../../database/user.schema";
import { successResponse } from "../../common/api-utils";

// Admin users controller does not inject UsersService because that service is
// scoped to customer-facing operations (getProfile, updateProfile, addresses).
// Admin operations (listing all users, banning, role promotion, hard delete)
// are qualitatively different and interact directly with the UserModel here
// rather than routing through the customer-facing service layer. This keeps
// both layers independently maintainable.

@ApiTags("Admin — Users")
@ApiBearerAuth()
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles("admin")
@Controller("admin/users")
export class AdminUsersController {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  private safe(user: any) {
    const obj = user.toObject ? user.toObject() : user;
    const { passwordHash, ...rest } = obj;
    return { ...rest, id: obj._id?.toString() };
  }

  // ── GET /admin/users — paginated user list with search ────────────────────
  @Get()
  @ApiOperation({
    summary: "[Admin] List all users with pagination and search",
  })
  @ApiQuery({ name: "page", required: false })
  @ApiQuery({ name: "limit", required: false })
  @ApiQuery({
    name: "search",
    required: false,
    description: "Search by email, firstName or lastName",
  })
  @ApiQuery({
    name: "role",
    required: false,
    description: "Filter by role: customer | admin",
  })
  @ApiQuery({ name: "isActive", required: false, description: "true | false" })
  async findAll(
    @Query("page") page?: number,
    @Query("limit") limit?: number,
    @Query("search") search?: string,
    @Query("role") role?: string,
    @Query("isActive") isActive?: string,
  ) {
    const filter: any = {};
    if (role) filter.role = role;
    if (isActive !== undefined) filter.isActive = isActive === "true";
    if (search) {
      filter.$or = [
        { email: { $regex: search, $options: "i" } },
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
      ];
    }

    const p = Number(page ?? 1);
    const l = Number(limit ?? 20);
    const skip = (p - 1) * l;

    const [users, total] = await Promise.all([
      this.userModel
        .find(filter)
        .select("-passwordHash")
        .skip(skip)
        .limit(l)
        .lean(),
      this.userModel.countDocuments(filter),
    ]);

    return successResponse({
      users,
      pagination: {
        total,
        page: p,
        limit: l,
        totalPages: Math.ceil(total / l),
        hasNextPage: p * l < total,
      },
    });
  }

  // ── GET /admin/users/:id — single user detail ─────────────────────────────
  @Get(":id")
  @ApiOperation({ summary: "[Admin] Get single user by MongoDB _id" })
  @ApiParam({ name: "id" })
  async findOne(@Param("id") id: string) {
    const user = await this.userModel.findById(id).lean();
    if (!user) return successResponse(null, { message: "User not found" });
    const { passwordHash, ...safe } = user as any;
    return successResponse(safe);
  }

  // ── PATCH /admin/users/:id/ban — deactivate account ──────────────────────
  @Patch(":id/ban")
  @ApiOperation({ summary: "[Admin] Ban a user (sets isActive: false)" })
  @ApiParam({ name: "id" })
  async ban(@Param("id") id: string) {
    const user = await this.userModel
      .findByIdAndUpdate(id, { isActive: false }, { new: true })
      .lean();
    if (!user) return successResponse(null, { message: "User not found" });
    const { passwordHash, ...safe } = user as any;
    return successResponse({ ...safe, banned: true });
  }

  // ── PATCH /admin/users/:id/unban — reactivate account ────────────────────
  @Patch(":id/unban")
  @ApiOperation({ summary: "[Admin] Unban a user (sets isActive: true)" })
  @ApiParam({ name: "id" })
  async unban(@Param("id") id: string) {
    const user = await this.userModel
      .findByIdAndUpdate(id, { isActive: true }, { new: true })
      .lean();
    if (!user) return successResponse(null, { message: "User not found" });
    const { passwordHash, ...safe } = user as any;
    return successResponse({ ...safe, banned: false });
  }

  // ── PATCH /admin/users/:id/role — promote or demote user role ────────────
  @Patch(":id/role")
  @ApiOperation({ summary: "[Admin] Change user role (customer | admin)" })
  @ApiParam({ name: "id" })
  async changeRole(@Param("id") id: string, @Body() body: { role: string }) {
    if (!["customer", "admin"].includes(body.role)) {
      return successResponse(null, {
        message: "Invalid role — must be customer or admin",
      });
    }
    const user = await this.userModel
      .findByIdAndUpdate(id, { role: body.role }, { new: true })
      .lean();
    if (!user) return successResponse(null, { message: "User not found" });
    const { passwordHash, ...safe } = user as any;
    return successResponse(safe);
  }

  // ── DELETE /admin/users/:id — hard delete (irreversible) ─────────────────
  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "[Admin] Permanently delete a user account" })
  @ApiParam({ name: "id" })
  async remove(@Param("id") id: string) {
    const user = await this.userModel.findByIdAndDelete(id);
    if (!user) return successResponse(null, { message: "User not found" });
    return successResponse({ deleted: true, id });
  }
}
