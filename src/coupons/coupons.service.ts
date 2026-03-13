import { Injectable, BadRequestException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Coupon, CouponDocument } from '../database/coupon.schema'

@Injectable()
export class CouponsService {
  constructor(@InjectModel(Coupon.name) private couponModel: Model<CouponDocument>) {}

  async validate(code: string) {
    const coupon = await this.couponModel.findOne({ code: code.toUpperCase() })
    if (!coupon)
      throw new BadRequestException({ code: 'INVALID_COUPON', message: 'Coupon code not found' })
    if (!coupon.isActive)
      throw new BadRequestException({
        code: 'INACTIVE_COUPON',
        message: 'This coupon is no longer active',
      })
    if (new Date(coupon.expiresAt) < new Date())
      throw new BadRequestException({ code: 'EXPIRED_COUPON', message: 'This coupon has expired' })
    if (coupon.usedCount >= coupon.usageLimit)
      throw new BadRequestException({
        code: 'COUPON_LIMIT_REACHED',
        message: 'This coupon has reached its usage limit',
      })

    return {
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      minOrderAmount: coupon.minOrderAmount,
      applicableCategories: coupon.applicableCategories,
      expiresAt: coupon.expiresAt,
      usageRemaining: coupon.usageLimit - coupon.usedCount,
      description:
        coupon.type === 'percentage'
          ? `${coupon.value}% off (max $${coupon.maxDiscount})`
          : coupon.type === 'fixed'
            ? `$${coupon.value} off`
            : 'Free shipping',
    }
  }
}
