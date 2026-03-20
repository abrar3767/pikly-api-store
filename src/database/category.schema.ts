import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type CategoryDocument = Category & Document

@Schema({ timestamps: true })
export class Category {
  @Prop({ required: true, unique: true }) id: string          // "cat_laptops"
  @Prop({ required: true }) name: string                       // "Laptops"
  @Prop({ required: true, unique: true }) slug: string         // "laptops"

  // ── Amazon node data ─────────────────────────────────────────────────────────
  @Prop() nodeId: string                                        // "565108"
  @Prop() amazonPath: string                                    // "Electronics > Computers & Accessories > Laptops"

  // ── Hierarchy ────────────────────────────────────────────────────────────────
  @Prop({ default: null }) parentId: string | null
  @Prop({ default: 0 }) level: number                          // 0=root, 1=sub, 2=sub-sub, 3=deep

  // ── Display ──────────────────────────────────────────────────────────────────
  @Prop({ default: null }) image: string
  @Prop({ default: null }) icon: string
  @Prop({ default: '' }) description: string
  @Prop({ default: 0 }) productCount: number
  @Prop({ default: true }) isActive: boolean
  @Prop({ default: false }) isFeatured: boolean
  @Prop({ default: 0 }) sortOrder: number

  // ── Dynamic facets config (per-category filters) ─────────────────────────────
  // Each facet tells the frontend AND Algolia what filters to show for this category.
  // key       → query param name (e.g. "brand", "attrs", "size", "color")
  // label     → display label in UI
  // type      → "checkbox" | "range" | "rating" | "boolean"
  // algoliaAttr → Algolia attribute name to facet on
  // disjunctive → true = OR logic (multi-select), false = AND
  // attrKey   → when key="attrs", which attrValues prefix to filter (e.g. "ram")
  // values    → optional preset values to show in UI
  @Prop({ type: [Object], default: [] }) facets: Array<{
    key: string
    label: string
    type: string
    algoliaAttr: string
    disjunctive: boolean
    attrKey?: string
    values?: string[]
  }>

  // Legacy field kept for backward compat (same as facets)
  @Prop({ type: [Object], default: [] }) filters: any[]
}

export const CategorySchema = SchemaFactory.createForClass(Category)

CategorySchema.index({ isActive: 1, isFeatured: 1 })
CategorySchema.index({ parentId: 1 })
CategorySchema.index({ level: 1, isActive: 1 })
CategorySchema.index({ nodeId: 1 }, { sparse: true })
