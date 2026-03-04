import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { AuthGuard } from "@nestjs/passport";
import { UsersService } from "./users.service";
import { successResponse } from "../common/api-utils";

@ApiTags("Users")
@ApiBearerAuth()
@UseGuards(AuthGuard("jwt"))
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("profile")
  @ApiOperation({ summary: "Get my profile" })
  getProfile(@Request() req: any) {
    return successResponse(this.usersService.getProfile(req.user.userId));
  }

  @Patch("profile")
  @ApiOperation({
    summary: "Update my profile (firstName, lastName, phone, avatar)",
  })
  updateProfile(@Request() req: any, @Body() body: any) {
    return successResponse(
      this.usersService.updateProfile(req.user.userId, body),
    );
  }

  @Get("addresses")
  @ApiOperation({ summary: "Get my addresses" })
  getAddresses(@Request() req: any) {
    return successResponse(this.usersService.getAddresses(req.user.userId));
  }

  @Post("addresses")
  @ApiOperation({ summary: "Add a new address" })
  addAddress(@Request() req: any, @Body() body: any) {
    return successResponse(this.usersService.addAddress(req.user.userId, body));
  }

  @Patch("addresses/:addressId")
  @ApiOperation({ summary: "Update an address" })
  updateAddress(
    @Request() req: any,
    @Param("addressId") addressId: string,
    @Body() body: any,
  ) {
    return successResponse(
      this.usersService.updateAddress(req.user.userId, addressId, body),
    );
  }

  @Delete("addresses/:addressId")
  @ApiOperation({ summary: "Delete an address" })
  deleteAddress(@Request() req: any, @Param("addressId") addressId: string) {
    return successResponse(
      this.usersService.deleteAddress(req.user.userId, addressId),
    );
  }
}
