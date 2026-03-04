import { Injectable, BadRequestException } from '@nestjs/common'
import * as fs   from 'fs'
import * as path from 'path'

@Injectable()
export class CouponsService {
  private coupons: any[] = []

  constructor() {
    try {
      this.coupons = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'coupons.json'), 'utf-8'))
    } catch { this.coupons = [] }
  }

  validate(code: string) {
    const coupon = this.coupons.find(c => c.code.toUpperCase() === code.toUpperCase())
    if (!coupon) throw new BadRequestException({ code: 'INVALID_COUPON', message: 'Coupon code not found' })
    if (!coupon.isActive) throw new BadRequestException({ code: 'INACTIVE_COUPON', message: 'This coupon is no longer active' })
    if (new Date(coupon.expiresAt) < new Date()) throw new BadRequestException({ code: 'EXPIRED_COUPON', message: 'This coupon has expired' })
    if (coupon.usedCount >= coupon.usageLimit) throw new BadRequestException({ code: 'COUPON_LIMIT_REACHED', message: 'This coupon has reached its usage limit' })

    return {
      code:                coupon.code,
      type:                coupon.type,
      value:               coupon.value,
      minOrderAmount:      coupon.minOrderAmount,
      applicableCategories: coupon.applicableCategories,
      expiresAt:           coupon.expiresAt,
      usageRemaining:      coupon.usageLimit - coupon.usedCount,
      description:         coupon.type === 'percentage'
        ? `${coupon.value}% off (max $${coupon.maxDiscount})`
        : coupon.type === 'fixed'
        ? `$${coupon.value} off`
        : 'Free shipping',
    }
  }
}
