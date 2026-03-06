import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type OrderDocument = Order & Document

@Schema({ timestamps: true })
export class Order {
  @Prop({ required: true, unique: true })
  orderId: string

  @Prop({ required: true })
  userId: string

  @Prop({
    default: 'confirmed',
    enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'],
  })
  status: string

  @Prop({ type: [Object], default: [] })
  items: any[]

  @Prop({ type: Object })
  pricing: any

  @Prop({ type: Object, default: null })
  couponApplied: any

  @Prop({ type: Object })
  shippingAddress: any

  @Prop({ required: true })
  paymentMethod: string

  @Prop({
    default: 'paid',
    enum: ['pending', 'paid', 'refunded', 'failed'],
  })
  paymentStatus: string

  @Prop({ default: null })
  notes: string

  @Prop({ type: [Object], default: [] })
  timeline: any[]

  @Prop({ default: null })
  trackingNumber: string

  @Prop()
  estimatedDelivery: string
}

export const OrderSchema = SchemaFactory.createForClass(Order)
OrderSchema.index({ userId: 1, createdAt: -1 })
OrderSchema.index({ status: 1, createdAt: -1 })
OrderSchema.index({ orderId: 1 }, { unique: true })
