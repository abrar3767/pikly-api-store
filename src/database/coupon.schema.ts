import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type CouponDocument = Coupon & Document

@Schema({ timestamps: true })
export class Coupon {
  @Prop({ required: true, unique: true }) id: string
  @Prop({ required: true, uppercase: true }) code: string
  @Prop({ required: true, enum: ['percentage', 'fixed', 'free_shipping'] }) type: string
  @Prop({ required: true }) value: number
  @Prop({ default: 0 }) minOrderAmount: number
  @Prop({ default: null }) maxDiscount: number
  @Prop({ default: 1000 }) usageLimit: number
  @Prop({ default: 0 }) usedCount: number

  // BUG-03: tracks which individual users have used this coupon.
  // usageLimit is the global cap (total uses across all users).
  // A user whose userId appears here cannot apply the coupon again.
  // Using $addToSet at redemption time makes this insert idempotent.
  @Prop({ type: [String], default: [] })
  usedByUserIds: string[]

  @Prop({ type: [String], default: [] }) applicableCategories: string[]
  @Prop({ type: [String], default: [] }) applicableProducts: string[]
  @Prop({ type: Date, required: true }) expiresAt: Date
  @Prop({ default: true }) isActive: boolean
}

export const CouponSchema = SchemaFactory.createForClass(Coupon)
CouponSchema.index({ isActive: 1, expiresAt: 1 })
CouponSchema.index({ code: 1 }, { unique: true })
// Allows efficient $in lookups when checking whether a specific userId has
// already used this coupon (see cart.service.ts applyCoupon and orders.service.ts)
CouponSchema.index({ usedByUserIds: 1 })
