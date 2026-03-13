import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type PasswordResetTokenDocument = PasswordResetToken & Document

@Schema()
export class PasswordResetToken {
  @Prop({ required: true, index: true }) userId: string
  @Prop({ required: true, unique: true }) token: string
  @Prop({ required: true }) expiresAt: Date
  // BUG FIX: removed the `used: boolean` field. It was never set to true
  // anywhere in the codebase — after a successful reset, the token was deleted
  // via deleteOne(), not marked used. The field was dead code. The query in
  // auth.service.ts filtered on `used: false` which was always true for any
  // token in the collection (since the default is false and it was never
  // flipped), making the condition meaningless. Token reuse is already
  // prevented by deletion — no flag needed.
}

export const PasswordResetTokenSchema = SchemaFactory.createForClass(PasswordResetToken)
PasswordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
