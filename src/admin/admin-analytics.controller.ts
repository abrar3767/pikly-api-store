import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger'
import { AuthGuard }   from '@nestjs/passport'
import { InjectModel } from '@nestjs/mongoose'
import { Model }       from 'mongoose'
import { RolesGuard }  from '../common/guards/roles.guard'
import { Roles }       from '../common/decorators/roles.decorator'
import { Order,  OrderDocument  } from '../database/order.schema'
import { User,   UserDocument   } from '../database/user.schema'
import { successResponse }        from '../common/api-utils'

// FEAT-07: Revenue and sales analytics endpoints
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
  @ApiQuery({ name: 'from', required: false, description: 'ISO date string' })
  @ApiQuery({ name: 'to',   required: false, description: 'ISO date string' })
  async revenue(@Query('from') from?: string, @Query('to') to?: string) {
    const match: any = { status: { $nin: ['cancelled'] } }
    if (from || to) {
      match.createdAt = {}
      if (from) match.createdAt.$gte = new Date(from)
      if (to)   match.createdAt.$lte = new Date(to)
    }

    const [result] = await this.orderModel.aggregate([
      { $match: match },
      {
        $group: {
          _id:        null,
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
  @ApiQuery({ name: 'days', required: false, description: 'Default: 30' })
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
          title:     { $first: '$items.title'    },
          revenue:   { $sum:  '$items.subtotal'  },
          unitsSold: { $sum:  '$items.quantity'  },
          orders:    { $sum:   1                 },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: l },
    ])

    return successResponse(data.map(d => ({
      productId: d._id,
      title:     d.title,
      revenue:   parseFloat((d.revenue ?? 0).toFixed(2)),
      unitsSold: d.unitsSold,
      orders:    d.orders,
    })))
  }

  @Get('customers')
  @ApiOperation({ summary: '[Admin] Customer stats — total, new this month' })
  async customerStats() {
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const [total, newThisMonth] = await Promise.all([
      this.userModel.countDocuments({ role: 'customer' }),
      this.userModel.countDocuments({ role: 'customer', createdAt: { $gte: startOfMonth } }),
    ])

    return successResponse({ total, newThisMonth, returning: total - newThisMonth })
  }
}
