import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type PasswordResetTokenDocument = PasswordResetToken & Document

@Schema()
export class PasswordResetToken {
  @Prop({ required: true, index: true }) userId:    string
  @Prop({ required: true, unique: true }) token:    string
  @Prop({ required: true })              expiresAt: Date
  @Prop({ default: false })              used:      boolean
}

export const PasswordResetTokenSchema = SchemaFactory.createForClass(PasswordResetToken)
PasswordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
