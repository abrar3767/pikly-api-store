import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type WebhookDocument = Webhook & Document

@Schema({ timestamps: true })
export class Webhook {
  @Prop({ required: true })              userId:    string
  @Prop({ required: true })              url:       string
  @Prop({ type: [String], default: [] }) events:    string[]
  @Prop({ required: true })             secret:    string
  @Prop({ default: true })               isActive:  boolean
  @Prop({ default: null })               lastTriggeredAt: Date
}

export const WebhookSchema = SchemaFactory.createForClass(Webhook)
WebhookSchema.index({ userId: 1 })
