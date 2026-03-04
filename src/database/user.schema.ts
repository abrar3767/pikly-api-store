import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, lowercase: true })
  email: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ required: true })
  firstName: string;

  @Prop({ required: true })
  lastName: string;

  @Prop({ default: null })
  avatar: string;

  @Prop({ default: null })
  phone: string;

  @Prop({ default: "customer" })
  role: string;

  @Prop({ type: [Object], default: [] })
  addresses: any[];

  @Prop({ type: [String], default: [] })
  wishlist: string[];

  @Prop({ type: [String], default: [] })
  recentlyViewed: string[];

  @Prop({ default: 0 })
  loyaltyPoints: number;

  @Prop({ default: true })
  isVerified: boolean;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: null })
  lastLogin: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
