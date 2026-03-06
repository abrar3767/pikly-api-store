import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type TokenBlacklistDocument = TokenBlacklist & Document

// Each row stores a revoked JWT's unique ID (jti claim).
// The TTL index on `expiresAt` lets MongoDB auto-delete rows once the
// original token's own expiry has passed — so the blacklist never grows
// unboundedly and we never block tokens that are already expired anyway.
@Schema()
export class TokenBlacklist {
  @Prop({ required: true, unique: true })
  jti: string

  @Prop({ required: true })
  expiresAt: Date
}

export const TokenBlacklistSchema = SchemaFactory.createForClass(TokenBlacklist)

// TTL index: MongoDB removes the document automatically when `expiresAt` is reached.
TokenBlacklistSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
// Lookup index for the validate() hot path — every authenticated request hits this.
TokenBlacklistSchema.index({ jti: 1 })
