import { Test, TestingModule } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { CartService } from '../cart.service'
import { ProductsService } from '../../products/products.service'
import { Cart } from '../../database/cart.schema'
import { Coupon } from '../../database/coupon.schema'

const mockCartDoc = (overrides: any = {}) => ({
  sessionId: 'sess1',
  userId: null,
  items: [],
  coupon: null,
  save: jest.fn().mockResolvedValue(undefined),
  ...overrides,
})

describe('CartService', () => {
  let service: CartService
  let cartModel: any
  let couponModel: any
  let productsService: any

  let testingModule: TestingModule

  beforeEach(async () => {
    cartModel = {
      findOne: jest.fn(),
      create: jest.fn(),
      deleteOne: jest.fn().mockResolvedValue({}),
    }
    couponModel = { findOne: jest.fn() }

    // getLiveProduct was added to CartService in the SEC-04 / BUG-07 fixes.
    // It fetches live stock from MongoDB before adding/merging items.
    // Returning null here means the service falls back to the in-memory
    // product snapshot stock value, which is fine for unit tests.
    productsService = {
      products: [],
      findProductById: jest.fn(),
      getLiveProduct: jest.fn().mockResolvedValue(null),
    }

    testingModule = await Test.createTestingModule({
      providers: [
        CartService,
        { provide: getModelToken(Cart.name), useValue: cartModel },
        { provide: getModelToken(Coupon.name), useValue: couponModel },
        // FIX: use the class reference as the token, not the string 'ProductsService'.
        // NestJS resolves constructor-injected dependencies by their class type,
        // so { provide: ProductsService } matches — { provide: 'ProductsService' } does not.
        { provide: ProductsService, useValue: productsService },
      ],
    }).compile()

    service = testingModule.get<CartService>(CartService)
  })

  afterAll(async () => {
    await testingModule?.close()
  })

  describe('addItem', () => {
    it('throws PRODUCT_NOT_FOUND when product is not in the store', async () => {
      productsService.products = []
      const doc = mockCartDoc()
      cartModel.findOne.mockResolvedValue(doc)

      await expect(
        service.addItem({ productId: 'nonexistent', quantity: 1, sessionId: 'sess1' }),
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('applyCoupon', () => {
    it('throws INVALID_COUPON for unknown code', async () => {
      couponModel.findOne.mockResolvedValue(null)
      cartModel.findOne.mockResolvedValue(mockCartDoc())

      await expect(service.applyCoupon({ code: 'FAKE', sessionId: 'sess1' })).rejects.toThrow(
        BadRequestException,
      )
    })

    it('throws EXPIRED_COUPON for past expiresAt', async () => {
      couponModel.findOne.mockResolvedValue({
        code: 'OLD',
        type: 'percentage',
        value: 10,
        isActive: true,
        expiresAt: new Date('2000-01-01'),
        usedCount: 0,
        usageLimit: 100,
        minOrderAmount: 0,
        usedByUserIds: [],
        applicableCategories: [],
        applicableProducts: [],
      })
      cartModel.findOne.mockResolvedValue(mockCartDoc({ items: [{ subtotal: 100 }] }))

      await expect(service.applyCoupon({ code: 'OLD', sessionId: 'sess1' })).rejects.toThrow(
        BadRequestException,
      )
    })

    it('throws COUPON_NOT_APPLICABLE when no cart items match restrictions', async () => {
      couponModel.findOne.mockResolvedValue({
        code: 'ELEC',
        type: 'percentage',
        value: 10,
        isActive: true,
        expiresAt: new Date(Date.now() + 86_400_000),
        usedCount: 0,
        usageLimit: 100,
        minOrderAmount: 0,
        usedByUserIds: [],
        applicableCategories: ['electronics'],
        applicableProducts: [],
      })
      productsService.findProductById.mockReturnValue({ category: 'fashion' })
      cartModel.findOne.mockResolvedValue(
        mockCartDoc({ items: [{ productId: 'prod1', subtotal: 100 }] }),
      )

      await expect(service.applyCoupon({ code: 'ELEC', sessionId: 'sess1' })).rejects.toThrow(
        BadRequestException,
      )
    })

    it('throws COUPON_ALREADY_USED when authenticated user has already redeemed the coupon (BUG-03)', async () => {
      couponModel.findOne.mockResolvedValue({
        code: 'USED10',
        type: 'percentage',
        value: 10,
        isActive: true,
        expiresAt: new Date(Date.now() + 86_400_000),
        usedCount: 1,
        usageLimit: 100,
        minOrderAmount: 0,
        usedByUserIds: ['uid-already-used'], // this user already redeemed it
        applicableCategories: [],
        applicableProducts: [],
      })
      cartModel.findOne.mockResolvedValue(mockCartDoc({ items: [{ subtotal: 100 }] }))

      // Pass the userId that already appears in usedByUserIds
      await expect(
        service.applyCoupon({ code: 'USED10', sessionId: 'sess1' }, 'uid-already-used'),
      ).rejects.toThrow(BadRequestException)
    })
  })

  describe('mergeCart', () => {
    it('copies guest coupon to user cart when user has none', async () => {
      const guestDoc = mockCartDoc({
        sessionId: 'guest1',
        items: [
          {
            productId: 'p1',
            quantity: 1,
            subtotal: 50,
            price: 50,
            originalPrice: 50,
            variantId: null,
            stock: 10,
          },
        ],
        coupon: { code: 'SAVE10', type: 'percentage', value: 10, discountValue: 0 },
      })
      const userDoc = mockCartDoc({ sessionId: 'user1', items: [], coupon: null })

      cartModel.findOne
        .mockResolvedValueOnce(guestDoc) // guest lookup
        .mockResolvedValueOnce(userDoc) // user lookup in getOrCreate

      // getLiveProduct returns a live product with stock so the item is not dropped
      productsService.getLiveProduct.mockResolvedValue({
        isActive: true,
        inventory: { stock: 10 },
        variants: [],
      })

      const result = await service.mergeCart({ guestSessionId: 'guest1', userId: 'user1' })
      expect((result as any).couponMerged).toBe(true)
    })

    it('drops out-of-stock items from guest cart during merge (BUG-07)', async () => {
      const guestDoc = mockCartDoc({
        sessionId: 'guest1',
        items: [
          {
            productId: 'p-oos',
            quantity: 2,
            subtotal: 100,
            price: 50,
            originalPrice: 50,
            variantId: null,
            stock: 5,
          },
        ],
        coupon: null,
      })
      const userDoc = mockCartDoc({ sessionId: 'user1', items: [], coupon: null })

      cartModel.findOne.mockResolvedValueOnce(guestDoc).mockResolvedValueOnce(userDoc)

      // Simulate the product being out of stock by the time of merge
      productsService.getLiveProduct.mockResolvedValue({
        isActive: true,
        inventory: { stock: 0 },
        variants: [],
      })

      const result = await service.mergeCart({ guestSessionId: 'guest1', userId: 'user1' })
      // The out-of-stock item should have been silently dropped
      expect((result as any).items).toHaveLength(0)
    })
  })
})
