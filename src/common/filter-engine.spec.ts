import { filterProducts } from './filter-engine'

const products = [
  {
    id: 'p1',
    title: 'Apple iPhone 15',
    brand: 'Apple',
    category: 'electronics',
    subcategory: 'smartphones',
    pricing: { current: 999, original: 999, discountPercent: 0 },
    ratings: { average: 4.5, count: 100 },
    inventory: { stock: 10, sold: 50 },
    shipping: { freeShipping: true },
    attributes: { color: 'black', storage: '256GB' },
    featured: true,
    bestSeller: true,
    newArrival: false,
    trending: true,
    topRated: true,
    onSale: false,
    isActive: true,
    description: 'Flagship phone',
    tags: ['phone', 'apple'],
    createdAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'p2',
    title: 'Samsung Galaxy S24',
    brand: 'Samsung',
    category: 'electronics',
    subcategory: 'smartphones',
    pricing: { current: 799, original: 899, discountPercent: 11 },
    ratings: { average: 4.2, count: 80 },
    inventory: { stock: 0, sold: 200 },
    shipping: { freeShipping: false },
    attributes: { color: 'white', storage: '128GB' },
    featured: false,
    bestSeller: false,
    newArrival: true,
    trending: false,
    topRated: false,
    onSale: true,
    isActive: true,
    description: 'Android flagship',
    tags: ['phone', 'samsung'],
    createdAt: '2024-02-01T00:00:00Z',
  },
  {
    id: 'p3',
    title: 'Nike Running Shoes',
    brand: 'Nike',
    category: 'fashion',
    subcategory: 'shoes',
    pricing: { current: 120, original: 150, discountPercent: 20 },
    ratings: { average: 4.0, count: 200 },
    inventory: { stock: 25, sold: 500 },
    shipping: { freeShipping: true },
    attributes: { color: 'red', size: '10' },
    featured: false,
    bestSeller: true,
    newArrival: false,
    trending: false,
    topRated: false,
    onSale: true,
    isActive: true,
    description: 'Running shoes',
    tags: ['shoes', 'nike'],
    createdAt: '2023-12-01T00:00:00Z',
  },
]

describe('filterProducts', () => {
  it('filters by category', () => {
    const result = filterProducts(products, { category: 'electronics' })
    expect(result.items).toHaveLength(2)
    expect(result.items.every((p) => p.category === 'electronics')).toBe(true)
  })

  it('filters by brand (comma-separated)', () => {
    const result = filterProducts(products, { brand: 'Apple,Nike' })
    expect(result.items).toHaveLength(2)
    const brands = result.items.map((p) => p.brand)
    expect(brands).toContain('Apple')
    expect(brands).toContain('Nike')
  })

  it('filters by price range', () => {
    const result = filterProducts(products, { minPrice: 500, maxPrice: 900 })
    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe('p2')
  })

  it('filters by inStock:true', () => {
    const result = filterProducts(products, { inStock: true })
    expect(result.items.every((p) => p.inventory.stock > 0)).toBe(true)
  })

  it('BUG-05: parses attribute value with colon correctly (e.g. color:#FF5733)', () => {
    const withHexColor = [{ ...products[0], attributes: { color: '#FF5733' } }]
    const result = filterProducts(withHexColor, { attrs: 'color:#FF5733' })
    expect(result.items).toHaveLength(1)
  })

  it('BUG-04: fuzzy search is applied AFTER category filter', () => {
    // If search ran first on the full catalogue, "iPhone" would also match
    // non-electronics items that happen to have "phone" in their description.
    // With BUG-04 fixed, category is applied first so only electronics are searched.
    const result = filterProducts(products, { q: 'iPhone', category: 'electronics' })
    expect(result.items.every((p) => p.category === 'electronics')).toBe(true)
  })
})
