import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type CounterDocument = Counter & Document

// A general-purpose atomic counter backed by MongoDB's findOneAndUpdate + $inc.
// Using this guarantees sequential IDs even under concurrent requests or
// multi-process deployments because the increment is a single atomic DB operation,
// unlike an in-memory counter which resets per process and causes collisions.
@Schema()
export class Counter {
  @Prop({ required: true, unique: true })
  name: string

  @Prop({ default: 1000 })
  seq: number
}

export const CounterSchema = SchemaFactory.createForClass(Counter)
