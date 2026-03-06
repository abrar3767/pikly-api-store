import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type CouponDocument = Coupon & Document

@Schema({ timestamps: true })
export class Coupon {
  @Prop({ required: true, unique: true })                           id:                   string
  @Prop({ required: true, unique: true, uppercase: true })         code:                 string
  @Prop({ required: true, enum: ['percentage','fixed','free_shipping'] }) type:          string
  @Prop({ required: true })                                        value:                number
  @Prop({ default: 0 })                                            minOrderAmount:       number
  @Prop({ default: null })                                         maxDiscount:          number
  @Prop({ default: 1000 })                                         usageLimit:           number
  @Prop({ default: 0 })                                            usedCount:            number
  @Prop({ type: [String], default: [] })                           applicableCategories: string[]
  @Prop({ type: [String], default: [] })                           applicableProducts:   string[]
  // SCH-03 fix: stored as native Date so MongoDB can index + range-query it
  @Prop({ type: Date, required: true })                            expiresAt:            Date
  @Prop({ default: true })                                         isActive:             boolean
}

export const CouponSchema = SchemaFactory.createForClass(Coupon)
CouponSchema.index({ isActive: 1, expiresAt: 1 })
CouponSchema.index({ code: 1 })
