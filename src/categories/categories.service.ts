import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { CacheService, TTL } from '../common/cache.service'
import { Category, CategoryDocument } from '../database/category.schema'
import { AlgoliaService } from '../algolia/algolia.service'

@Injectable()
export class CategoriesService implements OnModuleInit {
  public categories: any[] = []

  constructor(
    @InjectModel(Category.name) private categoryModel: Model<CategoryDocument>,
    private readonly cache: CacheService,
    private readonly algolia: AlgoliaService,
  ) {}

  async onModuleInit() {
    await this.loadCategories()
  }

  async loadCategories() {
    const docs = await this.categoryModel.find({}).lean()
    this.categories = docs.map(({ _id, __v, ...rest }: any) => rest)
  }

  async invalidate() {
    this.cache.del('categories:all')
    await this.loadCategories()
  }

  private buildTree() {
    const map: Record<string, any> = {}
    for (const c of this.categories) map[c.id] = { ...c, children: [] }
    const roots: any[] = []
    for (const c of Object.values(map)) {
      if (c.parentId && map[c.parentId]) map[c.parentId].children.push(c)
      else roots.push(c)
    }
    return roots
  }

  findAll() {
    const cached = this.cache.get<any>('categories:all')
    if (cached) return { data: cached, cacheHit: true }
    const tree = this.buildTree()
    this.cache.set('categories:all', tree, TTL.CATEGORIES)
    return { data: tree, cacheHit: false }
  }

  findFeatured() {
    return this.categories.filter((c) => c.isFeatured)
  }

  findOne(slug: string) {
    const cat = this.categories.find((c) => c.slug === slug)
    if (!cat)
      throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND', message: `Category "${slug}" not found` })
    return { ...cat, children: this.categories.filter((c) => c.parentId === cat.id) }
  }

  // products passed in from controller (from ProductsService.products)
  async findProducts(slug: string, products: any[], query: any) {
    const cat = this.categories.find((c) => c.slug === slug)
    if (!cat)
      throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND', message: `Category "${slug}" not found` })

    // Use Algolia for filtering — pass category slug merged into query
    return this.algolia.fullSearch(
      { ...query, category: slug },
      products.filter((p) => p.isActive),
    )
  }

  async adminCreate(body: any) {
    const cat = await this.categoryModel.create(body)
    await this.invalidate()
    return cat
  }

  async adminUpdate(id: string, body: any) {
    const cat = await this.categoryModel.findOneAndUpdate({ id }, { $set: body }, { new: true })
    if (!cat)
      throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND', message: `Category "${id}" not found` })
    await this.invalidate()
    return cat
  }

  async adminDelete(id: string) {
    const cat = await this.categoryModel.findOneAndDelete({ id })
    if (!cat)
      throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND', message: `Category "${id}" not found` })
    await this.invalidate()
    return { deleted: true, id }
  }
}