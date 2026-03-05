import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model }       from 'mongoose'
import Fuse            from 'fuse.js'
import { filterProducts }   from '../common/filter-engine'
import { buildFacets }      from '../common/facet-engine'
import { smartPaginate }    from '../common/api-utils'
import { CacheService, TTL } from '../common/cache.service'
import { FilterProductsDto } from './dto/filter-products.dto'
import { ReviewQueryDto }    from './dto/review-query.dto'
import { Product, ProductDocument } from '../database/product.schema'

// The filter and facet engines work against a plain JS array.
// We load all products from MongoDB once at startup into this.products[].
// This is cheap (106 products) and avoids rewriting the entire filter engine.
// Admin mutations call invalidate() which reloads from MongoDB immediately.
@Injectable()
export class ProductsService implements OnModuleInit {
  public products: any[] = []

  constructor(
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    private readonly cache: CacheService,
  ) {}

  async onModuleInit() {
    await this.loadProducts()
  }

  async loadProducts() {
    const docs = await this.productModel.find({}).lean()
    this.products = docs.map(({ _id, __v, ...rest }: any) => rest)
  }

  async invalidate() {
    this.cache.flush()
    await this.loadProducts()
  }

  findAll(query: FilterProductsDto) {
    const cacheKey = `products:${JSON.stringify(query)}`
    const cached   = this.cache.get<any>(cacheKey)
    if (cached) return { ...cached, meta: { ...cached.meta, cacheHit: true } }

    const activeProducts = this.products.filter(p => p.isActive)
    const filtered       = filterProducts(activeProducts, query)

    let facets = null
    if (query.includeFacets) {
      const allFiltered = filterProducts(activeProducts, { ...query, page: 1, limit: 99999 })
      facets = buildFacets(allFiltered.items, query as any)
    }

    const result = {
      products: filtered.items,
      pagination: {
        total:       filtered.total,
        limit:       filtered.limit,
        hasNextPage: filtered.hasNextPage,
        hasPrevPage: filtered.hasPrevPage,
        mode:        (filtered as any).mode,
        ...((filtered as any).mode === 'offset' && { page: (filtered as any).page, totalPages: (filtered as any).totalPages }),
        ...((filtered as any).mode === 'cursor' && { nextCursor: (filtered as any).nextCursor, prevCursor: (filtered as any).prevCursor }),
      },
      facets,
      appliedFilters: filtered.appliedFilters,
      sortOptions:    filtered.sortOptions,
      searchMeta:     filtered.searchMeta,
    }

    this.cache.set(cacheKey, { data: result }, TTL.PRODUCTS)
    return { data: result, cacheHit: false }
  }

  findFeatured()    { return this.products.filter(p => p.isActive && p.featured).sort((a,b) => b.ratings.average - a.ratings.average).slice(0,12) }
  findBestsellers() { return this.products.filter(p => p.isActive && p.bestSeller).sort((a,b) => (b.inventory?.sold??0)-(a.inventory?.sold??0)).slice(0,12) }
  findNewArrivals() { return this.products.filter(p => p.isActive && p.newArrival).sort((a,b) => new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime()).slice(0,12) }
  findTrending()    { return this.products.filter(p => p.isActive && p.trending).slice(0,12) }
  findTopRated()    { return this.products.filter(p => p.isActive && p.topRated).sort((a,b) => b.ratings.average - a.ratings.average).slice(0,12) }
  findOnSale()      { return this.products.filter(p => p.isActive && p.onSale).sort((a,b) => b.pricing.discountPercent - a.pricing.discountPercent).slice(0,12) }

  getSuggestions(q: string) {
    if (!q || q.trim().length < 2) return { suggestions: [] }
    const suggestions: any[] = []
    const active = this.products.filter(p => p.isActive)

    new Fuse(active, { keys: ['title','brand','tags'], threshold: 0.3, includeScore: true })
      .search(q.trim()).slice(0,3)
      .forEach(({ item }) => suggestions.push({ type: 'product', title: item.title, slug: item.slug, image: item.media?.thumb??'', price: item.pricing?.current }))

    const cats = ['electronics','laptops','smartphones','audio','fashion','shoes','home-kitchen','beauty','sports-fitness','books','accessories']
    cats.filter(c => c.includes(q.toLowerCase())).slice(0,2)
      .forEach(c => suggestions.push({ type: 'category', title: c.charAt(0).toUpperCase()+c.slice(1).replace('-',' '), slug: c }))

    new Fuse([...new Set(active.map(p => p.brand))].map(b => ({ name: b })), { keys: ['name'], threshold: 0.3 })
      .search(q).slice(0,2)
      .forEach(({ item }) => suggestions.push({ type: 'brand', title: item.name, query: `?brand=${encodeURIComponent(item.name)}` }))

    suggestions.push({ type: 'query', title: `${q} under $500`, query: `?q=${encodeURIComponent(q)}&maxPrice=500` })
    return { suggestions: suggestions.slice(0, 8) }
  }

  findById(id: string) {
    const product = this.products.find(p => p.id === id && p.isActive)
    if (!product) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: `Product with id "${id}" not found` })
    return this.findOne(product.slug)
  }

  findOne(slug: string) {
    const product = this.products.find(p => p.slug === slug && p.isActive)
    if (!product) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: `Product "${slug}" not found` })

    const related = this.products
      .filter(p => p.isActive && p.subcategory === product.subcategory && p.id !== product.id)
      .sort((a,b) => Math.abs(a.pricing.current-product.pricing.current) - Math.abs(b.pricing.current-product.pricing.current))
      .slice(0,8).map(p => ({ id:p.id,slug:p.slug,title:p.title,brand:p.brand,media:p.media,pricing:p.pricing,ratings:p.ratings,onSale:p.onSale,newArrival:p.newArrival }))

    const otherCats = this.products
      .filter(p => p.isActive && p.category !== product.category)
      .sort(() => Math.random()-0.5).slice(0,4)
      .map(p => ({ id:p.id,slug:p.slug,title:p.title,brand:p.brand,media:p.media,pricing:p.pricing,ratings:p.ratings }))

    const stock = product.inventory?.stock ?? 0
    const stockStatus = stock === 0 ? 'out_of_stock' : stock <= 10 ? 'low_stock' : 'in_stock'

    return {
      ...product,
      relatedProducts:      related,
      frequentlyBoughtWith: otherCats,
      stockStatus,
      deliveryEstimate: {
        standard: `${product.shipping?.estimatedDays?.min??3}-${product.shipping?.estimatedDays?.max??7} days`,
        express:  '1-2 days',
      },
    }
  }

  findReviews(slug: string, query: ReviewQueryDto) {
    const product = this.products.find(p => p.slug === slug)
    if (!product) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: `Product "${slug}" not found` })

    let reviews: any[] = [...(product.reviews ?? [])]
    if (query.rating)           reviews = reviews.filter(r => r.rating === Number(query.rating))
    if (query.verified === true) reviews = reviews.filter(r => r.verified === true)

    switch (query.sort) {
      case 'helpful':     reviews.sort((a,b) => b.helpful-a.helpful); break
      case 'rating_high': reviews.sort((a,b) => b.rating-a.rating);   break
      case 'rating_low':  reviews.sort((a,b) => a.rating-b.rating);   break
      default:            reviews.sort((a,b) => new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime())
    }

    const paginated = smartPaginate(reviews, { page: query.page, limit: query.limit??10, cursor: query.cursor })
    return {
      reviews:    paginated.items,
      pagination: {
        total: paginated.total, limit: paginated.limit,
        hasNextPage: paginated.hasNextPage, hasPrevPage: paginated.hasPrevPage, mode: paginated.mode,
        ...(paginated.mode==='offset' && { page:(paginated as any).page, totalPages:(paginated as any).totalPages }),
        ...(paginated.mode==='cursor' && { nextCursor:(paginated as any).nextCursor, prevCursor:(paginated as any).prevCursor }),
      },
      summary: {
        average: product.ratings.average, total: product.ratings.count,
        distribution: product.ratings.distribution ?? {},
        verifiedCount: reviews.filter(r => r.verified).length,
        withImages:    reviews.filter(r => r.images?.length > 0).length,
      },
    }
  }

  // ── Admin helpers ────────────────────────────────────────────────────────
  async adminFindAll(query: { page?:number; limit?:number; search?:string; isActive?:boolean }) {
    const filter: any = {}
    if (query.isActive !== undefined) filter.isActive = query.isActive
    if (query.search) filter.$or = [
      { title: { $regex: query.search, $options: 'i' } },
      { brand: { $regex: query.search, $options: 'i' } },
    ]
    const page = Number(query.page??1), limit = Number(query.limit??20), skip = (page-1)*limit
    const [items, total] = await Promise.all([
      this.productModel.find(filter).skip(skip).limit(limit).lean(),
      this.productModel.countDocuments(filter),
    ])
    return { products: items, pagination: { total, page, limit, totalPages: Math.ceil(total/limit), hasNextPage: page*limit<total } }
  }

  async adminCreate(body: any) {
    const existing = await this.productModel.findOne({ $or: [{ id: body.id }, { slug: body.slug }] })
    if (existing) throw new Error('Product with this id or slug already exists')
    const product = await this.productModel.create(body)
    await this.invalidate()
    return product
  }

  async adminUpdate(id: string, body: any) {
    const product = await this.productModel.findOneAndUpdate({ id }, { $set: body }, { new: true })
    if (!product) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: `Product "${id}" not found` })
    await this.invalidate()
    return product
  }

  async adminDelete(id: string) {
    const product = await this.productModel.findOneAndDelete({ id })
    if (!product) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: `Product "${id}" not found` })
    await this.invalidate()
    return { deleted: true, id }
  }
}
