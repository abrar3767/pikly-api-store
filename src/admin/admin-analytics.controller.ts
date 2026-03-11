import { Controller, Get, Query, UseGuards, BadRequestException } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger'
import { AuthGuard }   from '@nestjs/passport'
import { InjectModel } from '@nestjs/mongoose'
import { Model }       from 'mongoose'
import { RolesGuard }  from '../common/guards/roles.guard'
import { Roles }       from '../common/decorators/roles.decorator'
import { Order,  OrderDocument  } from '../database/order.schema'
import { User,   UserDocument   } from '../database/user.schema'
import { successResponse }        from '../common/api-utils'

// Parses a date string and throws a 400 if it is not a valid ISO 8601 date.
// Using new Date(str) directly is dangerous because new Date("garbage") produces
// an Invalid Date object rather than throwing, and MongoDB treats Invalid Date
// as null in match expressions — meaning { $gte: null } matches everything.
function parseDateParam(value: string | undefined, paramName: string): Date | undefined {
  if (value === undefined) return undefined
  const d = new Date(value)
  if (isNaN(d.getTime())) {
    throw new BadRequestException({
      code:    'INVALID_DATE',
      message: `Query parameter "${paramName}" must be a valid ISO 8601 date string (e.g. 2024-01-15T00:00:00Z)`,
    })
  }
  return d
}

@ApiTags('Admin — Analytics')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
@Controller('admin/analytics')
export class AdminAnalyticsController {
  constructor(
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(User.name)  private userModel:  Model<UserDocument>,
  ) {}

  @Get('revenue')
  @ApiOperation({ summary: '[Admin] Revenue summary — total, AOV, by date range' })
  @ApiQuery({ name: 'from', required: false, description: 'ISO 8601 date string' })
  @ApiQuery({ name: 'to',   required: false, description: 'ISO 8601 date string' })
  async revenue(@Query('from') from?: string, @Query('to') to?: string) {
    // BUG-04: validate before use — invalid dates are rejected with a 400
    const fromDate = parseDateParam(from, 'from')
    const toDate   = parseDateParam(to, 'to')

    const match: any = { status: { $nin: ['cancelled'] } }
    if (fromDate || toDate) {
      match.createdAt = {}
      if (fromDate) match.createdAt.$gte = fromDate
      if (toDate)   match.createdAt.$lte = toDate
    }

    const [result] = await this.orderModel.aggregate([
      { $match: match },
      {
        $group: {
          _id:          null,
          totalRevenue:   { $sum: '$pricing.total'    },
          totalOrders:    { $sum: 1                   },
          avgOrderValue:  { $avg: '$pricing.total'    },
          totalDiscount:  { $sum: '$pricing.discount' },
        },
      },
    ])

    return successResponse({
      totalRevenue:  parseFloat((result?.totalRevenue  ?? 0).toFixed(2)),
      totalOrders:   result?.totalOrders  ?? 0,
      avgOrderValue: parseFloat((result?.avgOrderValue ?? 0).toFixed(2)),
      totalDiscount: parseFloat((result?.totalDiscount ?? 0).toFixed(2)),
      period:        { from: from ?? 'all', to: to ?? 'all' },
    })
  }

  @Get('revenue-by-day')
  @ApiOperation({ summary: '[Admin] Daily revenue for the last N days' })
  @ApiQuery({ name: 'days', required: false, description: 'Default: 30, max: 365' })
  async revenueByDay(@Query('days') days?: number) {
    const d    = Math.min(365, Math.max(1, Number(days ?? 30)))
    const from = new Date(Date.now() - d * 86_400_000)

    const data = await this.orderModel.aggregate([
      { $match: { createdAt: { $gte: from }, status: { $nin: ['cancelled'] } } },
      {
        $group: {
          _id:     { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: '$pricing.total' },
          orders:  { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ])

    return successResponse(data.map(row => ({
      date:    row._id,
      revenue: parseFloat((row.revenue ?? 0).toFixed(2)),
      orders:  row.orders,
    })))
  }

  @Get('top-products')
  @ApiOperation({ summary: '[Admin] Top selling products by revenue' })
  @ApiQuery({ name: 'limit', required: false })
  async topProducts(@Query('limit') limit?: number) {
    const l = Math.min(50, Math.max(1, Number(limit ?? 10)))

    const data = await this.orderModel.aggregate([
      { $match: { status: { $nin: ['cancelled'] } } },
      { $unwind: '$items' },
      {
        $group: {
          _id:       '$items.productId',
          title:     { $first: '$items.title'   },
          revenue:   { $sum:   '$items.subtotal' },
          unitsSold: { $sum:   '$items.quantity' },
          orders:    { $sum:   1                 },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: l },
    ])

    return successResponse(data.map(row => ({
      productId: row._id, title: row.title,
      revenue:   parseFloat((row.revenue ?? 0).toFixed(2)),
      unitsSold: row.unitsSold, orders: row.orders,
    })))
  }

  @Get('users')
  @ApiOperation({ summary: '[Admin] User growth and registration stats' })
  async userStats() {
    const [total, verified, active, admins] = await Promise.all([
      this.userModel.countDocuments({}),
      this.userModel.countDocuments({ isVerified: true }),
      this.userModel.countDocuments({ isActive: true }),
      this.userModel.countDocuments({ role: 'admin' }),
    ])
    return successResponse({ total, verified, active, admins, unverified: total - verified })
  }
}
