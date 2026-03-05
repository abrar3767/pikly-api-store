import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type CartDocument = Cart & Document;

// FIX BUG#6: removed manual @Prop() updatedAt: string — it conflicted with
// timestamps:true which already manages updatedAt as a proper Date field.
// In cart.service.ts, all lines setting cart.updatedAt = new Date().toISOString()
// should also be removed — Mongoose handles it automatically on every .save() call.
@Schema({ timestamps: true })
export class Cart {
  @Prop({ required: true, unique: true })
  sessionId: string;

  @Prop({ default: null })
  userId: string;

  @Prop({ type: [Object], default: [] })
  items: any[];

  @Prop({ type: Object, default: null })
  coupon: any;
}

export const CartSchema = SchemaFactory.createForClass(Cart);
