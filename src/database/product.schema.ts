import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type ProductDocument = Product & Document

@Schema({ timestamps: true })
export class Product {
  @Prop({ required: true, unique: true }) id: string
  @Prop({ required: true, unique: true }) slug: string
  @Prop({ required: true }) title: string
  @Prop() brand: string
  @Prop() category: string
  @Prop() subcategory: string
  @Prop() subSubcategory: string
  @Prop() description: string
  @Prop({ type: [String], default: [] }) tags: string[]
  @Prop({ type: Object }) pricing: any
  @Prop({ type: Object }) inventory: any
  @Prop({ type: Object }) media: any
  @Prop({ type: Object }) ratings: any
  @Prop({ type: Object }) shipping: any
  @Prop({ type: Object }) attributes: any
  @Prop({ type: [Object], default: [] }) variants: any[]
  @Prop({ type: [Object], default: [] }) reviews: any[]
  @Prop({ default: false }) featured: boolean
  @Prop({ default: false }) bestSeller: boolean
  @Prop({ default: false }) newArrival: boolean
  @Prop({ default: false }) trending: boolean
  @Prop({ default: false }) topRated: boolean
  @Prop({ default: false }) onSale: boolean
  @Prop({ default: false }) isFeatured: boolean
  @Prop({ default: true  }) isActive: boolean
}

export const ProductSchema = SchemaFactory.createForClass(Product)
ProductSchema.index({ title: 'text', brand: 'text', description: 'text' })
ProductSchema.index({ category: 1, isActive: 1 })
ProductSchema.index({ subcategory: 1, isActive: 1 })
