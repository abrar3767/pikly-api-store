import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import * as mongoose from 'mongoose'
import { Document } from 'mongoose'

export type CartDocument = Cart & Document

@Schema({ timestamps: true })
export class Cart {
  @Prop({ required: true, unique: true }) sessionId: string
  // SCH-02: reference to User ObjectId; nullable for guest carts
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null })
  userId: mongoose.Types.ObjectId | null
  @Prop({ type: [Object], default: [] }) items: any[]
  @Prop({ type: Object, default: null }) coupon: any
}

export const CartSchema = SchemaFactory.createForClass(Cart)
// SCH-07 fix: TTL index — abandoned carts auto-deleted after 7 days of inactivity
CartSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 })
CartSchema.index({ userId: 1 })
