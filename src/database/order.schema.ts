import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import * as mongoose from 'mongoose'
import { Document } from 'mongoose'

export type OrderDocument = Order & Document

@Schema({ timestamps: true })
export class Order {
  @Prop({ required: true, unique: true }) orderId: string
  // SCH-02: proper ObjectId reference for relational integrity
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true })
  userId: mongoose.Types.ObjectId
  @Prop({ default: 'pending', enum: ['pending','confirmed','processing','shipped','delivered','cancelled'] })
  status: string
  @Prop({ type: [Object], default: [] }) items:           any[]
  @Prop({ type: Object })                pricing:         any
  @Prop({ type: Object, default: null }) couponApplied:   any
  @Prop({ type: Object })                shippingAddress: any
  // SCH-04 fix: enum validation on paymentMethod
  @Prop({ required: true, enum: ['card','cod','wallet'] }) paymentMethod: string
  @Prop({ default: 'pending', enum: ['pending','paid','refunded','failed'] })
  paymentStatus: string
  @Prop({ default: null })               notes:            string
  @Prop({ type: [Object], default: [] }) timeline:         any[]
  @Prop({ default: null })               trackingNumber:   string
  @Prop()                                estimatedDelivery: string
}

export const OrderSchema = SchemaFactory.createForClass(Order)
OrderSchema.index({ userId: 1, createdAt: -1 })
OrderSchema.index({ status: 1, createdAt: -1 })
OrderSchema.index({ orderId: 1 }, { unique: true })
