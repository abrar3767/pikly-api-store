import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type ProductDocument = Product & Document;

// We use @Prop({ type: Object }) for all nested fields (pricing, inventory, media,
// ratings, variants etc.) because the product shape is deeply nested with arrays
// inside objects inside objects. Flattening it into sub-schemas would triple the
// file size with no practical benefit for a catalog that is seeded once and queried.
@Schema({ timestamps: true })
export class Product {
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ required: true, unique: true })
  slug: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  brand: string;

  @Prop({ default: "" })
  description: string;

  @Prop({ required: true })
  category: string;

  @Prop({ default: null })
  subcategory: string;

  @Prop({ default: null })
  subSubcategory: string;

  @Prop({ default: null })
  imgKeyword: string;

  @Prop({ default: false }) featured: boolean;
  @Prop({ default: false }) bestSeller: boolean;
  @Prop({ default: false }) newArrival: boolean;
  @Prop({ default: false }) trending: boolean;
  @Prop({ default: false }) topRated: boolean;
  @Prop({ default: false }) onSale: boolean;
  @Prop({ default: false }) isFeatured: boolean;
  @Prop({ default: true }) isActive: boolean;

  @Prop({ type: Object, default: {} }) pricing: any;
  @Prop({ type: Object, default: {} }) inventory: any;
  @Prop({ type: Object, default: {} }) attributes: any;
  @Prop({ type: Object, default: {} }) media: any;
  @Prop({ type: Object, default: {} }) ratings: any;
  @Prop({ type: Object, default: {} }) seo: any;
  @Prop({ type: Object, default: {} }) shipping: any;

  @Prop({ type: [Object], default: [] }) variants: any[];
  @Prop({ type: [Object], default: [] }) reviews: any[];
  @Prop({ type: [Object], default: [] }) tags: any[];

  @Prop({ default: null }) createdAt: string;
  @Prop({ default: null }) updatedAt: string;
}

export const ProductSchema = SchemaFactory.createForClass(Product);

// Text index for full-text search across title, brand, description and tags
ProductSchema.index({
  title: "text",
  brand: "text",
  description: "text",
  tags: "text",
});
// Compound index for the most common filter queries
ProductSchema.index({ category: 1, isActive: 1 });
ProductSchema.index({ subcategory: 1, isActive: 1 });
ProductSchema.index({ slug: 1 }, { unique: true });
