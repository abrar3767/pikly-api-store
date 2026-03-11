import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type ProductDocument = Product & Document

@Schema({ timestamps: true })
export class Product {
  // PERF-04: the `id` field is the primary application-level key used in every
  // cart, stock, and admin operation. Without an index, each findOne({ id }) is
  // a full collection scan. The index turns it into an O(log n) lookup.
  @Prop({ required: true, unique: true, index: true }) id:            string
  @Prop({ required: true, unique: true })              slug:          string
  @Prop({ required: true })                            title:         string
  @Prop()                                              brand:         string
  @Prop()                                              category:      string
  @Prop()                                              subcategory:   string
  @Prop()                                              subSubcategory: string
  @Prop()                                              description:   string
  @Prop({ type: [String], default: [] })               tags:          string[]
  @Prop({ type: Object })                              pricing:       any
  @Prop({ type: Object })                              inventory:     any
  @Prop({ type: Object })                              media:         any
  @Prop({ type: Object })                              ratings:       any
  @Prop({ type: Object })                              shipping:      any
  @Prop({ type: Object })                              attributes:    any
  @Prop({ type: [Object], default: [] })               variants:      any[]
  @Prop({ type: [Object], default: [] })               reviews:       any[]
  @Prop({ default: false }) featured:   boolean
  @Prop({ default: false }) bestSeller: boolean
  @Prop({ default: false }) newArrival: boolean
  @Prop({ default: false }) trending:   boolean
  @Prop({ default: false }) topRated:   boolean
  @Prop({ default: false }) onSale:     boolean
  @Prop({ default: true  }) isActive:   boolean
}

export const ProductSchema = SchemaFactory.createForClass(Product)

// Full-text search index for the product search endpoint
ProductSchema.index({ title: 'text', brand: 'text', description: 'text' })

// Compound indexes for the most common query filters
ProductSchema.index({ category: 1, isActive: 1 })
ProductSchema.index({ subcategory: 1, isActive: 1 })

// PERF-04: explicit sparse index for fast review userId lookups (BUG-01 duplicate check)
ProductSchema.index({ 'reviews.userId': 1 })
