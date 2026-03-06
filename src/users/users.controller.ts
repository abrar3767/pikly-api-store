import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, UseGuards, Request,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { AuthGuard }    from '@nestjs/passport'
import { UsersService } from './users.service'
import { successResponse } from '../common/api-utils'
import { UpdateProfileDto, AddAddressDto, UpdateAddressDto } from './dto/users.dto'

// Every route in this controller requires a valid JWT.
// The userId is always extracted from the verified token (req.user.userId),
// never from a client-supplied parameter — this prevents IDOR attacks where
// a user could read or modify another user's data by passing a different userId.
@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Get my profile' })
  async getProfile(@Request() req: any) {
    const data = await this.usersService.getProfile(req.user.userId)
    return successResponse(data)
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update my profile (firstName, lastName, phone, avatar)' })
  async updateProfile(@Request() req: any, @Body() dto: UpdateProfileDto) {
    const data = await this.usersService.updateProfile(req.user.userId, dto)
    return successResponse(data)
  }

  @Get('addresses')
  @ApiOperation({ summary: 'Get my saved addresses' })
  async getAddresses(@Request() req: any) {
    const data = await this.usersService.getAddresses(req.user.userId)
    return successResponse(data)
  }

  @Post('addresses')
  @ApiOperation({ summary: 'Add a new address' })
  async addAddress(@Request() req: any, @Body() dto: AddAddressDto) {
    const data = await this.usersService.addAddress(req.user.userId, dto)
    return successResponse(data)
  }

  @Patch('addresses/:addressId')
  @ApiOperation({ summary: 'Update an existing address' })
  async updateAddress(
    @Request() req: any,
    @Param('addressId') addressId: string,
    @Body() dto: UpdateAddressDto,
  ) {
    const data = await this.usersService.updateAddress(req.user.userId, addressId, dto)
    return successResponse(data)
  }

  @Delete('addresses/:addressId')
  @ApiOperation({ summary: 'Delete an address' })
  async deleteAddress(@Request() req: any, @Param('addressId') addressId: string) {
    const data = await this.usersService.deleteAddress(req.user.userId, addressId)
    return successResponse(data)
  }
}
