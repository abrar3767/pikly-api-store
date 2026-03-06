import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type UserDocument = User & Document

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, lowercase: true })
  email: string

  @Prop({ required: true })
  passwordHash: string

  @Prop({ required: true })
  firstName: string

  @Prop({ required: true })
  lastName: string

  @Prop({ default: null })
  avatar: string

  @Prop({ default: null })
  phone: string

  @Prop({ default: 'customer', enum: ['customer', 'admin'] })
  role: string

  // Stored as raw objects — validated at the DTO layer before saving
  @Prop({ type: [Object], default: [] })
  addresses: any[]

  @Prop({ type: [String], default: [] })
  wishlist: string[]

  @Prop({ type: [String], default: [] })
  recentlyViewed: string[]

  @Prop({ default: 0 })
  loyaltyPoints: number

  // SEC-02: new accounts are unverified by default — users must confirm their
  // email before logging in. The schema default is false so that any code path
  // that creates a user without explicitly setting this (e.g. seed scripts)
  // does NOT accidentally bypass email verification.
  @Prop({ default: false })
  isVerified: boolean

  @Prop({ default: true })
  isActive: boolean

  // Stored as a native Date, not a string, so MongoDB can index and query it
  @Prop({ type: Date, default: null })
  lastLogin: Date
}

export const UserSchema = SchemaFactory.createForClass(User)
// Email is already unique (declared on the field), add a generic query index
UserSchema.index({ role: 1, isActive: 1 })
