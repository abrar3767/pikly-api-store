import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type CouponDocument = Coupon & Document

@Schema({ timestamps: true })
export class Coupon {
  @Prop({ required: true, unique: true }) id: string
  @Prop({ required: true, unique: true, uppercase: true }) code: string
  @Prop({ required: true, enum: ['percentage', 'fixed', 'free_shipping'] }) type: string
  @Prop({ required: true }) value: number
  @Prop({ default: 0 }) minOrderAmount: number
  @Prop({ default: null }) maxDiscount: number
  @Prop({ default: 1000 }) usageLimit: number
  @Prop({ default: 0 }) usedCount: number
  @Prop({ type: [String], default: [] }) applicableCategories: string[]
  @Prop({ type: [String], default: [] }) applicableProducts: string[]
  @Prop({ required: true }) expiresAt: string
  @Prop({ default: true }) isActive: boolean
}

export const CouponSchema = SchemaFactory.createForClass(Coupon)
CouponSchema.index({ isActive: 1, expiresAt: 1 })
