import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type CategoryDocument = Category & Document

@Schema({ timestamps: true })
export class Category {
  @Prop({ required: true, unique: true }) id: string
  @Prop({ required: true }) name: string
  @Prop({ required: true, unique: true }) slug: string
  @Prop({ default: null }) parentId: string
  @Prop({ default: 0 }) level: number
  @Prop({ default: null }) image: string
  @Prop({ default: null }) icon: string
  @Prop({ default: '' }) description: string
  @Prop({ default: 0 }) productCount: number
  @Prop({ default: true }) isActive: boolean
  // Single canonical "featured" flag — removed the duplicate `featured` field
  // that previously co-existed with `isFeatured` inconsistently.
  @Prop({ default: false }) isFeatured: boolean
  @Prop({ default: 0 }) sortOrder: number
  @Prop({ type: [Object], default: [] }) filters: any[]
}

export const CategorySchema = SchemaFactory.createForClass(Category)
CategorySchema.index({ isActive: 1, isFeatured: 1 })
CategorySchema.index({ parentId: 1 })
