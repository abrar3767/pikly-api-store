import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type CartDocument = Cart & Document

@Schema({ timestamps: true })
export class Cart {
  @Prop({ required: true, unique: true }) sessionId: string
  @Prop({ default: null }) userId: string
  @Prop({ type: [Object], default: [] }) items: any[]
  @Prop({ type: Object, default: null }) coupon: any
}

export const CartSchema = SchemaFactory.createForClass(Cart)
