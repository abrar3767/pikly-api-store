import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type ProductDocument = Product & Document

@Schema({ timestamps: true })
export class Product {

  // ── Core Identity ────────────────────────────────────────────────────────────
  @Prop({ required: true, unique: true, index: true }) id: string
  @Prop({ required: true, unique: true, index: true }) slug: string
  @Prop() asin: string                          // Amazon ASIN e.g. "B073JYC4XM"
  @Prop({ required: true }) title: string
  @Prop() brand: string
  @Prop() manufacturer: string
  @Prop() modelNumber: string
  @Prop({ default: true }) isActive: boolean

  // ── Category (full Amazon hierarchy) ────────────────────────────────────────
  // Flat fields kept for backward compat + Algolia indexing
  @Prop({ index: true }) category: string       // slug e.g. "electronics"
  @Prop({ index: true }) subcategory: string    // slug e.g. "laptops"
  @Prop() subSubcategory: string                // slug e.g. "gaming-laptops"

  // Full category object — breadcrumbs, path, ids
  @Prop({ type: Object }) categoryInfo: {
    id: string                                  // "cat_laptops"
    nodeId: string                              // "565108"
    name: string                                // "Laptops"
    slug: string                                // "laptops"
    path: string                                // "Electronics > Computers & Accessories > Laptops"
    breadcrumbs: Array<{
      id: string
      nodeId: string
      name: string
      slug: string
      level: number
    }>
  }

  // ── Content ──────────────────────────────────────────────────────────────────
  @Prop() description: string
  @Prop({ type: [String], default: [] }) featureBullets: string[]
  @Prop({ type: [String], default: [] }) tags: string[]
  @Prop({ type: [String], default: [] }) whatsInTheBox: string[]

  // ── Media ────────────────────────────────────────────────────────────────────
  @Prop({ type: Object }) media: {
    mainImage: string
    images: Array<{
      url: string
      variant: string                           // "MAIN" | "PT01" | "PT02" ...
    }>
    videosCount: number
  }

  // ── Pricing ──────────────────────────────────────────────────────────────────
  @Prop({ type: Object }) pricing: {
    current: number
    original: number
    currency: string                            // "USD"
    symbol: string                              // "$"
    discountPercent: number
    discountAmount: number
    unitPrice: string                           // "$0.60/Ounce"
    isDeal: boolean
    dealBadge: string | null                    // "Limited time deal"
    coupon: {
      hasCoupon: boolean
      amount: number | null
      type: string | null                       // "percent" | "fixed"
      badgeText: string | null                  // "Save $0.66"
    }
    priceHistory: Array<{
      date: string
      price: number
    }>
  }

  // ── Inventory & Availability ─────────────────────────────────────────────────
  @Prop({ type: Object }) inventory: {
    stock: number
    sold: number
    reserved: number
    warehouse: string
    restockDate: string | null
  }

  @Prop({ type: Object }) availability: {
    status: string                              // "in_stock" | "out_of_stock" | "limited"
    stockLevel: number
    dispatchDays: number
    message: string                             // "Only 1 left in stock"
    maxOrderQuantity: number | null
  }

  // ── Delivery & Fulfillment ───────────────────────────────────────────────────
  @Prop({ type: Object }) delivery: {
    isPrime: boolean
    isFreeShipping: boolean
    standardDelivery: {
      date: string
      label: string                             // "FREE"
    }
    fastestDelivery: {
      date: string
      label: string
    }
    soldBy: string
    fulfilledBy: string                         // "Amazon" | "Seller"
    isSoldByAmazon: boolean
    isFulfilledByAmazon: boolean
    expressAvailable: boolean
  }

  // ── Ratings & Reviews ────────────────────────────────────────────────────────
  @Prop({ type: Object }) ratings: {
    average: number
    total: number
    breakdown: {
      five_star:  { percent: number; count: number }
      four_star:  { percent: number; count: number }
      three_star: { percent: number; count: number }
      two_star:   { percent: number; count: number }
      one_star:   { percent: number; count: number }
    }
  }

  @Prop({ type: [Object], default: [] }) reviews: Array<{
    id: string
    title: string
    body: string
    rating: number
    date: string
    reviewer: string
    verified: boolean
    helpfulVotes: number
    userId?: string
  }>

  // ── Specifications / Attributes ──────────────────────────────────────────────
  // Raw key-value specs from product page
  @Prop({ type: [Object], default: [] }) specifications: Array<{
    name: string
    value: string
  }>

  // Structured attributes for faceting (category-specific)
  @Prop({ type: Object }) attributes: Record<string, string>

  // Flat array for Algolia faceting: ["ram:16GB", "storage:512GB", "os:Windows 11"]
  @Prop({ type: [String], default: [] }) attrValues: string[]

  // Variant-level color/size arrays for Algolia faceting
  @Prop({ type: [String], default: [] }) colors: string[]
  @Prop({ type: [String], default: [] }) sizes: string[]

  // ── Variants ─────────────────────────────────────────────────────────────────
  @Prop({ type: [Object], default: [] }) variants: Array<{
    variantId: string
    asin: string
    title: string
    attribute: string                           // "128GB" | "Black" | "Large"
    price: number
    image: string
    color?: string
    colorHex?: string
    size?: string
    inStock: boolean
  }>

  // ── Badges & Rankings ────────────────────────────────────────────────────────
  @Prop({ type: Object }) badges: {
    isAmazonsChoice: boolean
    isBestSeller: boolean
    isNewRelease: boolean
    isSponsored: boolean
    recentSales: string | null                  // "100+ bought in past month"
  }

  @Prop({ type: [Object], default: [] }) bestsellersRank: Array<{
    rank: number
    category: string
    categoryId: string
    link: string
  }>

  // ── Boolean filter flags (for Algolia) ───────────────────────────────────────
  @Prop({ default: false }) featured: boolean
  @Prop({ default: false }) bestSeller: boolean
  @Prop({ default: false }) newArrival: boolean
  @Prop({ default: false }) trending: boolean
  @Prop({ default: false }) topRated: boolean
  @Prop({ default: false }) onSale: boolean
  @Prop({ default: false }) isPrime: boolean
  @Prop({ default: false }) freeShipping: boolean
  @Prop({ default: false }) expressAvailable: boolean
  @Prop({ default: false }) inStock: boolean

  // ── Related Products ─────────────────────────────────────────────────────────
  @Prop({ type: Object }) newerModel: {
    asin: string
    title: string
    image: string
    link: string
  } | null

  @Prop({ type: Object }) protectionPlans: Array<{
    name: string
    durationMonths: number
    price: number
    currency: string
  }>

  // ── Shipping details ─────────────────────────────────────────────────────────
  @Prop({ type: Object }) shipping: {
    weight: string
    dimensions: string
    freeShipping: boolean
    expressAvailable: boolean
    shipsFrom: string
    condition: string                           // "New" | "Refurbished" | "Used"
  }

  // ── Metadata ─────────────────────────────────────────────────────────────────
  @Prop({ type: Object }) metadata: {
    dateFirstAvailable: string
    source: string                              // "rainforest_api" | "manual" | "generated"
    amazonUrl: string
    marketplaceId: string
    isBundle: boolean
    hasAPlus: boolean
  }

  // ── Algolia helpers (computed, flat numeric fields) ───────────────────────────
  @Prop({ default: 0 }) avgRating: number       // = ratings.average (Algolia numeric sort)
  @Prop({ default: 0 }) soldCount: number        // = inventory.sold
  @Prop({ default: 0 }) discountPercent: number  // = pricing.discountPercent
  @Prop({ default: 0 }) price: number            // = pricing.current (Algolia range filter)
  @Prop({ default: 0 }) createdAtMs: number      // epoch ms for "newest" sort replica
  @Prop() condition: string                      // "New" | "Refurbished" | "Used"
  @Prop() warehouse: string                      // "WH-East-01"
}

export const ProductSchema = SchemaFactory.createForClass(Product)

// ── Full-text search index ────────────────────────────────────────────────────
ProductSchema.index({ title: 'text', brand: 'text', description: 'text', tags: 'text' })

// ── Category indexes ──────────────────────────────────────────────────────────
ProductSchema.index({ category: 1, isActive: 1 })
ProductSchema.index({ subcategory: 1, isActive: 1 })
ProductSchema.index({ 'categoryInfo.id': 1, isActive: 1 })

// ── Boolean flag indexes ──────────────────────────────────────────────────────
ProductSchema.index({ featured: 1, isActive: 1 })
ProductSchema.index({ bestSeller: 1, isActive: 1 })
ProductSchema.index({ newArrival: 1, isActive: 1 })
ProductSchema.index({ trending: 1, isActive: 1 })
ProductSchema.index({ onSale: 1, isActive: 1 })
ProductSchema.index({ isPrime: 1, isActive: 1 })
ProductSchema.index({ inStock: 1, isActive: 1 })

// ── Sort/filter indexes ───────────────────────────────────────────────────────
ProductSchema.index({ price: 1, isActive: 1 })
ProductSchema.index({ avgRating: -1, isActive: 1 })
ProductSchema.index({ soldCount: -1, isActive: 1 })
ProductSchema.index({ discountPercent: -1, isActive: 1 })
ProductSchema.index({ createdAtMs: -1, isActive: 1 })

// ── Algolia attrValues index (for category-specific facets) ───────────────────
ProductSchema.index({ attrValues: 1 })
ProductSchema.index({ colors: 1 })
ProductSchema.index({ sizes: 1 })

// ── ASIN index ───────────────────────────────────────────────────────────────
ProductSchema.index({ asin: 1 }, { sparse: true })

// ── Review userId index (BUG-01 duplicate check) ─────────────────────────────
ProductSchema.index({ 'reviews.userId': 1 })
