import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import * as fs   from 'fs'
import * as path from 'path'

@Injectable()
export class CompareService {
  private products: any[] = []

  constructor() {
    try {
      this.products = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'products.json'), 'utf-8'))
    } catch { this.products = [] }
  }

  compare(productIds: string[]) {
    if (productIds.length < 2)  throw new BadRequestException({ code: 'MIN_PRODUCTS', message: 'At least 2 products required for comparison' })
    if (productIds.length > 4)  throw new BadRequestException({ code: 'MAX_PRODUCTS', message: 'Maximum 4 products can be compared at once' })

    const products = productIds.map(id => {
      const p = this.products.find(p => p.id === id && p.isActive)
      if (!p) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: `Product ${id} not found` })
      return p
    })

    // Gather all attribute keys across all products
    const allAttrKeys = [...new Set(products.flatMap(p => Object.keys(p.attributes ?? {})))]

    const attributeComparison: Record<string, any> = {}
    for (const key of allAttrKeys) {
      attributeComparison[key] = products.map(p => ({
        productId: p.id,
        value:     p.attributes?.[key] ?? '—',
      }))
    }

    // Determine winner per dimension
    const prices  = products.map(p => p.pricing.current)
    const ratings = products.map(p => p.ratings.average)
    const winner  = {
      price:    products[prices.indexOf(Math.min(...prices))]?.id ?? null,
      rating:   products[ratings.indexOf(Math.max(...ratings))]?.id ?? null,
      discount: products.reduce((best, p) => p.pricing.discountPercent > (best?.pricing.discountPercent ?? -1) ? p : best, null as any)?.id ?? null,
    }

    // Simplified product cards for comparison
    const cards = products.map(p => ({
      id:       p.id,
      slug:     p.slug,
      title:    p.title,
      brand:    p.brand,
      media:    p.media,
      pricing:  p.pricing,
      ratings:  p.ratings,
      inventory: { stock: p.inventory.stock },
      shipping:  p.shipping,
      attributes: p.attributes,
      tags:      p.tags,
    }))

    return { products: cards, attributeComparison, winner }
  }
}
