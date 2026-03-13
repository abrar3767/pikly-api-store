import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type VerificationTokenDocument = VerificationToken & Document

@Schema()
export class VerificationToken {
  @Prop({ required: true, index: true }) userId: string
  @Prop({ required: true, unique: true }) token: string
  @Prop({ required: true }) expiresAt: Date
}

export const VerificationTokenSchema = SchemaFactory.createForClass(VerificationToken)
VerificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
