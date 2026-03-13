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
  NotFoundException,
  BadRequestException,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger'
import { AuthGuard } from '@nestjs/passport'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { User, UserDocument } from '../database/user.schema'
import { successResponse } from '../common/api-utils'

@ApiTags('Admin — Users')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
@Controller('admin/users')
export class AdminUsersController {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  @Get()
  @ApiOperation({ summary: '[Admin] List all users with pagination and search' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'role', required: false })
  @ApiQuery({ name: 'isActive', required: false })
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('role') role?: string,
    @Query('isActive') isActive?: string,
  ) {
    const filter: any = {}
    if (role) filter.role = role
    if (isActive !== undefined) filter.isActive = isActive === 'true'
    if (search && search.length <= 100) {
      // Escape the search string to prevent ReDoS.
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      filter.$or = [
        { email: { $regex: escaped, $options: 'i' } },
        { firstName: { $regex: escaped, $options: 'i' } },
        { lastName: { $regex: escaped, $options: 'i' } },
      ]
    }
    const p = Number(page ?? 1),
      l = Number(limit ?? 20),
      skip = (p - 1) * l
    const [users, total] = await Promise.all([
      this.userModel.find(filter).select('-passwordHash').skip(skip).limit(l).lean(),
      this.userModel.countDocuments(filter),
    ])
    return successResponse({
      users,
      pagination: {
        total,
        page: p,
        limit: l,
        totalPages: Math.ceil(total / l),
        hasNextPage: p * l < total,
      },
    })
  }

  @Get(':id')
  @ApiOperation({ summary: '[Admin] Get single user by MongoDB _id' })
  @ApiParam({ name: 'id' })
  async findOne(@Param('id') id: string) {
    const user = await this.userModel.findById(id).lean()
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' })
    const { passwordHash, ...safe } = user as any
    return successResponse(safe)
  }

  @Patch(':id/ban')
  @ApiOperation({ summary: '[Admin] Ban a user (set isActive = false)' })
  @ApiParam({ name: 'id' })
  async ban(@Param('id') id: string) {
    const user = await this.userModel
      .findByIdAndUpdate(id, { isActive: false }, { new: true })
      .lean()
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' })
    const { passwordHash, ...safe } = user as any
    return successResponse({ ...safe, banned: true })
  }

  @Patch(':id/unban')
  @ApiOperation({ summary: '[Admin] Unban a user (set isActive = true)' })
  @ApiParam({ name: 'id' })
  async unban(@Param('id') id: string) {
    const user = await this.userModel
      .findByIdAndUpdate(id, { isActive: true }, { new: true })
      .lean()
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' })
    const { passwordHash, ...safe } = user as any
    return successResponse({ ...safe, banned: false })
  }

  @Patch(':id/role')
  @ApiOperation({ summary: '[Admin] Change user role (customer | admin)' })
  @ApiParam({ name: 'id' })
  async changeRole(@Param('id') id: string, @Body() body: { role: string }) {
    if (!['customer', 'admin'].includes(body.role)) {
      throw new BadRequestException({
        code: 'INVALID_ROLE',
        message: 'Role must be "customer" or "admin"',
      })
    }
    const user = await this.userModel
      .findByIdAndUpdate(id, { role: body.role }, { new: true })
      .lean()
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' })
    const { passwordHash, ...safe } = user as any
    return successResponse(safe)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Permanently delete a user account' })
  @ApiParam({ name: 'id' })
  async remove(@Param('id') id: string) {
    const user = await this.userModel.findByIdAndDelete(id)
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' })
    return successResponse({ deleted: true, id })
  }
}
