import { Injectable, NotFoundException } from '@nestjs/common'
import * as fs   from 'fs'
import * as path from 'path'

@Injectable()
export class WishlistService {
  private wishlists = new Map<string, Set<string>>()
  private products:  any[] = []

  constructor() {
    try {
      this.products = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'products.json'), 'utf-8'))
    } catch { this.products = [] }
  }

  private getOrCreate(userId: string): Set<string> {
    if (!this.wishlists.has(userId)) this.wishlists.set(userId, new Set())
    return this.wishlists.get(userId)!
  }

  getWishlist(userId: string) {
    const ids      = [...this.getOrCreate(userId)]
    const products = ids
      .map(id => this.products.find(p => p.id === id && p.isActive))
      .filter(Boolean)
      .map(p => ({
        id:      p.id,
        slug:    p.slug,
        title:   p.title,
        brand:   p.brand,
        media:   p.media,
        pricing: p.pricing,
        ratings: p.ratings,
        onSale:  p.onSale,
        inventory: { stock: p.inventory.stock },
      }))
    return { products, count: products.length, userId }
  }

  toggle(userId: string, productId: string) {
    const product = this.products.find(p => p.id === productId)
    if (!product) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: 'Product not found' })
    const list = this.getOrCreate(userId)
    if (list.has(productId)) {
      list.delete(productId)
      return { action: 'removed', productId, count: list.size }
    }
    list.add(productId)
    return { action: 'added', productId, count: list.size }
  }

  check(userId: string, productId: string) {
    const list = this.getOrCreate(userId)
    return { productId, userId, inWishlist: list.has(productId), count: list.size }
  }
}
