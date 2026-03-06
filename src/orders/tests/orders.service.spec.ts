import { Test, TestingModule }   from '@nestjs/testing'
import { getModelToken }         from '@nestjs/mongoose'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { OrdersService }  from '../orders.service'
import { Order }          from '../../database/order.schema'
import { User }           from '../../database/user.schema'
import { Coupon }         from '../../database/coupon.schema'
import { Counter }        from '../../database/counter.schema'

describe('OrdersService', () => {
  let service:      OrdersService
  let orderModel:   any
  let userModel:    any
  let couponModel:  any
  let counterModel: any
  let cartService:  any
  let productsService: any
  let mailService:  any
  let redis:        any

  beforeEach(async () => {
    orderModel   = { create: jest.fn(), findOne: jest.fn(), deleteOne: jest.fn() }
    userModel    = { findById: jest.fn() }
    couponModel  = { findOne: jest.fn(), findOneAndUpdate: jest.fn() }
    counterModel = { findOneAndUpdate: jest.fn().mockResolvedValue({ seq: 1 }) }
    cartService  = { getCart: jest.fn(), clearCart: jest.fn().mockResolvedValue(undefined) }
    productsService = {
      decrementStock: jest.fn().mockResolvedValue(true),
      incrementStock: jest.fn().mockResolvedValue(undefined),
    }
    mailService = { sendOrderConfirmation: jest.fn().mockResolvedValue(undefined) }
    redis       = {
      getIdempotencyKey: jest.fn().mockResolvedValue(null),
      setIdempotencyKey: jest.fn().mockResolvedValue(undefined),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getModelToken(Order.name),   useValue: orderModel   },
        { provide: getModelToken(User.name),    useValue: userModel    },
        { provide: getModelToken(Coupon.name),  useValue: couponModel  },
        { provide: getModelToken(Counter.name), useValue: counterModel },
        { provide: 'CartService',              useValue: cartService  },
        { provide: 'ProductsService',          useValue: productsService },
        { provide: 'MailService',              useValue: mailService  },
        { provide: 'RedisService',             useValue: redis        },
      ],
    })
      .overrideProvider('CartService').useValue(cartService)
      .overrideProvider('ProductsService').useValue(productsService)
      .overrideProvider('MailService').useValue(mailService)
      .overrideProvider('RedisService').useValue(redis)
      .compile()

    service = module.get<OrdersService>(OrdersService)
  })

  describe('createOrder', () => {
    it('throws EMPTY_CART when cart is empty', async () => {
      cartService.getCart.mockResolvedValue({ isEmpty: true, items: [], pricing: {} })
      await expect(service.createOrder('uid1', { sessionId:'s1', addressId:'a1', paymentMethod:'card' }))
        .rejects.toThrow(BadRequestException)
    })

    it('throws USER_NOT_FOUND when user does not exist', async () => {
      cartService.getCart.mockResolvedValue({ isEmpty:false, items:[{productId:'p1',quantity:1,title:'X',subtotal:50}], pricing:{} })
      userModel.findById.mockResolvedValue(null)
      await expect(service.createOrder('uid1', { sessionId:'s1', addressId:'a1', paymentMethod:'card' }))
        .rejects.toThrow(NotFoundException)
    })

    it('sets paymentStatus=pending for COD orders (SVC-01 fix)', async () => {
      const cart = { isEmpty:false, items:[{productId:'p1',quantity:1,title:'X',subtotal:50}], pricing:{subtotal:50,tax:5,total:55,discount:0}, coupon:null }
      cartService.getCart.mockResolvedValue(cart)
      const user = { _id:{ toString:()=>'uid1' }, email:'u@t.com', firstName:'U', addresses:[{ id:'a1',street:'1 Main',city:'NY',country:'USA' }] }
      userModel.findById.mockResolvedValue(user)
      orderModel.create.mockResolvedValue({ orderId:'ORD-2025-01001', toObject:()=>({}) })

      await service.createOrder('uid1', { sessionId:'s1', addressId:'a1', paymentMethod:'cod' })

      expect(orderModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ paymentMethod:'cod', paymentStatus:'pending', status:'pending' })
      )
    })

    it('sets paymentStatus=paid for card orders (SVC-01 fix)', async () => {
      const cart = { isEmpty:false, items:[{productId:'p1',quantity:1,title:'X',subtotal:50}], pricing:{subtotal:50,tax:5,total:55,discount:0}, coupon:null }
      cartService.getCart.mockResolvedValue(cart)
      const user = { _id:{ toString:()=>'uid1' }, email:'u@t.com', firstName:'U', addresses:[{ id:'a1',street:'1 Main',city:'NY',country:'USA' }] }
      userModel.findById.mockResolvedValue(user)
      orderModel.create.mockResolvedValue({ orderId:'ORD-2025-01001', toObject:()=>({}) })

      await service.createOrder('uid1', { sessionId:'s1', addressId:'a1', paymentMethod:'card' })

      expect(orderModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ paymentMethod:'card', paymentStatus:'paid', status:'confirmed' })
      )
    })

    it('rolls back stock if order save fails', async () => {
      const cart = { isEmpty:false, items:[{productId:'p1',quantity:2,title:'X',subtotal:100}], pricing:{subtotal:100,tax:10,total:110,discount:0}, coupon:null }
      cartService.getCart.mockResolvedValue(cart)
      const user = { _id:{ toString:()=>'uid1' }, email:'u@t.com', firstName:'U', addresses:[{ id:'a1',street:'1 Main',city:'NY',country:'USA' }] }
      userModel.findById.mockResolvedValue(user)
      orderModel.create.mockRejectedValue(new Error('DB error'))

      await expect(service.createOrder('uid1', { sessionId:'s1', addressId:'a1', paymentMethod:'card' }))
        .rejects.toBeDefined()

      // Stock must be restored after a failed save
      expect(productsService.incrementStock).toHaveBeenCalledWith('p1', 2)
    })
  })
})
