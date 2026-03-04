import { Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger'
import { UsersService }    from './users.service'
import { successResponse } from '../common/api-utils'

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':userId/profile')
  @ApiOperation({ summary: 'Get user profile' })
  @ApiParam({ name: 'userId' })
  getProfile(@Param('userId') userId: string) {
    return successResponse(this.usersService.getProfile(userId))
  }

  @Patch(':userId/profile')
  @ApiOperation({ summary: 'Update user profile (firstName, lastName, phone, avatar)' })
  @ApiParam({ name: 'userId' })
  updateProfile(@Param('userId') userId: string, @Body() body: any) {
    return successResponse(this.usersService.updateProfile(userId, body))
  }

  @Get(':userId/addresses')
  @ApiOperation({ summary: 'Get all saved addresses for user' })
  @ApiParam({ name: 'userId' })
  getAddresses(@Param('userId') userId: string) {
    return successResponse(this.usersService.getAddresses(userId))
  }

  @Post(':userId/addresses')
  @ApiOperation({ summary: 'Add a new address' })
  @ApiParam({ name: 'userId' })
  addAddress(@Param('userId') userId: string, @Body() body: any) {
    return successResponse(this.usersService.addAddress(userId, body))
  }

  @Patch(':userId/addresses/:addressId')
  @ApiOperation({ summary: 'Update an existing address' })
  @ApiParam({ name: 'userId' })
  @ApiParam({ name: 'addressId' })
  updateAddress(@Param('userId') userId: string, @Param('addressId') addressId: string, @Body() body: any) {
    return successResponse(this.usersService.updateAddress(userId, addressId, body))
  }

  @Delete(':userId/addresses/:addressId')
  @ApiOperation({ summary: 'Delete an address' })
  @ApiParam({ name: 'userId' })
  @ApiParam({ name: 'addressId' })
  deleteAddress(@Param('userId') userId: string, @Param('addressId') addressId: string) {
    return successResponse(this.usersService.deleteAddress(userId, addressId))
  }
}
