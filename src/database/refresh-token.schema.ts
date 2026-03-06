import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type RefreshTokenDocument = RefreshToken & Document

// Stores long-lived refresh tokens (30 days) separately from access tokens.
// Each row is one issued refresh token. On use, the token is deleted (rotation)
// and a new one is issued — this means a stolen refresh token can only be used
// once before being invalidated, limiting the damage window.
@Schema()
export class RefreshToken {
  @Prop({ required: true, index: true }) userId:    string
  @Prop({ required: true, unique: true }) tokenHash: string  // bcrypt hash for storage safety
  @Prop({ required: true })              expiresAt: Date
  @Prop({ default: () => new Date() })   createdAt: Date
}

export const RefreshTokenSchema = SchemaFactory.createForClass(RefreshToken)
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
