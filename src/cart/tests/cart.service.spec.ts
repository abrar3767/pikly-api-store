import { Test, TestingModule } from '@nestjs/testing'
import { getModelToken }       from '@nestjs/mongoose'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { CartService }    from '../cart.service'
import { Cart }           from '../../database/cart.schema'
import { Coupon }         from '../../database/coupon.schema'

const mockCartDoc = (overrides: any = {}) => ({
  sessionId: 'sess1',
  userId:    null,
  items:     [],
  coupon:    null,
  save:      jest.fn().mockResolvedValue(undefined),
  ...overrides,
})

describe('CartService', () => {
  let service:     CartService
  let cartModel:   any
  let couponModel: any
  let productsService: any

  beforeEach(async () => {
    cartModel = {
      findOne:  jest.fn(),
      create:   jest.fn(),
      deleteOne:jest.fn().mockResolvedValue({}),
    }
    couponModel = { findOne: jest.fn() }
    productsService = {
      products: [],
      findProductById: jest.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartService,
        { provide: getModelToken(Cart.name),   useValue: cartModel   },
        { provide: getModelToken(Coupon.name), useValue: couponModel },
        { provide: 'ProductsService',          useValue: productsService },
      ],
    })
      .overrideProvider('ProductsService').useValue(productsService)
      .compile()

    service = module.get<CartService>(CartService)
  })

  describe('addItem', () => {
    it('throws PRODUCT_NOT_FOUND when product is not in the store', async () => {
      productsService.products = []
      const doc = mockCartDoc()
      cartModel.findOne.mockResolvedValue(doc)

      await expect(service.addItem({ productId:'nonexistent', quantity:1, sessionId:'sess1' }))
        .rejects.toThrow(NotFoundException)
    })
  })

  describe('applyCoupon', () => {
    it('throws INVALID_COUPON for unknown code', async () => {
      couponModel.findOne.mockResolvedValue(null)
      const doc = mockCartDoc()
      cartModel.findOne.mockResolvedValue(doc)

      await expect(service.applyCoupon({ code:'FAKE', sessionId:'sess1' }))
        .rejects.toThrow(BadRequestException)
    })

    it('throws EXPIRED_COUPON for past expiresAt', async () => {
      couponModel.findOne.mockResolvedValue({
        code:'OLD', type:'percentage', value:10, isActive:true,
        expiresAt: new Date('2000-01-01'), // past date
        usedCount: 0, usageLimit: 100, minOrderAmount: 0,
        applicableCategories: [], applicableProducts: [],
      })
      const doc = mockCartDoc({ items:[{ subtotal:100 }] })
      cartModel.findOne.mockResolvedValue(doc)

      await expect(service.applyCoupon({ code:'OLD', sessionId:'sess1' }))
        .rejects.toThrow(BadRequestException)
    })

    it('throws COUPON_NOT_APPLICABLE when no cart items match restrictions (BUG-06 fix)', async () => {
      couponModel.findOne.mockResolvedValue({
        code:'ELEC', type:'percentage', value:10, isActive:true,
        expiresAt: new Date(Date.now() + 86_400_000),
        usedCount: 0, usageLimit: 100, minOrderAmount: 0,
        applicableCategories: ['electronics'], applicableProducts: [],
      })
      productsService.findProductById.mockReturnValue({ category: 'fashion' })
      const doc = mockCartDoc({ items:[{ productId:'prod1', subtotal:100 }] })
      cartModel.findOne.mockResolvedValue(doc)

      await expect(service.applyCoupon({ code:'ELEC', sessionId:'sess1' }))
        .rejects.toThrow(BadRequestException)
    })
  })

  describe('mergeCart', () => {
    it('copies guest coupon to user cart when user has none (BUG-10 fix)', async () => {
      const guestDoc = mockCartDoc({
        sessionId: 'guest1',
        items:     [{ productId:'p1', quantity:1, subtotal:50, price:50, originalPrice:50, variantId:null, stock:10 }],
        coupon:    { code:'SAVE10', type:'percentage', value:10, discountValue:0 },
      })
      const userDoc = mockCartDoc({ sessionId:'user1', items:[], coupon:null })

      cartModel.findOne
        .mockResolvedValueOnce(guestDoc)  // guest lookup
        .mockResolvedValueOnce(userDoc)   // user lookup in getOrCreate

      const result = await service.mergeCart({ guestSessionId:'guest1', userId:'user1' })
      expect((result as any).couponMerged).toBe(true)
    })
  })
})
