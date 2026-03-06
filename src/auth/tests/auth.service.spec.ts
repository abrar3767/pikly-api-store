import { Test, TestingModule } from '@nestjs/testing'
import { getModelToken }       from '@nestjs/mongoose'
import { JwtService }          from '@nestjs/jwt'
import { BadRequestException, UnauthorizedException } from '@nestjs/common'
import { AuthService }         from '../auth.service'
import { MailService }         from '../../mail/mail.service'
import { RedisService }        from '../../redis/redis.service'
import { User }                from '../../database/user.schema'
import { RefreshToken }        from '../../database/refresh-token.schema'
import { VerificationToken }   from '../../database/verification-token.schema'
import { PasswordResetToken }  from '../../database/password-reset-token.schema'
import * as bcrypt             from 'bcrypt'

// ── Helpers ──────────────────────────────────────────────────────────────────
// createMock builds a jest.fn()-based partial mock of a Mongoose Model so we
// can test service logic without touching a real database.
const createMock = (overrides: Record<string, any> = {}) => ({
  findOne:         jest.fn(),
  findById:        jest.fn(),
  findByIdAndUpdate: jest.fn(),
  create:          jest.fn(),
  deleteMany:      jest.fn(),
  deleteOne:       jest.fn(),
  ...overrides,
})

describe('AuthService', () => {
  let service: AuthService
  let userModel:    ReturnType<typeof createMock>
  let refreshModel: ReturnType<typeof createMock>
  let verifyModel:  ReturnType<typeof createMock>
  let resetModel:   ReturnType<typeof createMock>
  let jwtService:   jest.Mocked<Partial<JwtService>>
  let mailService:  jest.Mocked<Partial<MailService>>
  let redis:        jest.Mocked<Partial<RedisService>>

  beforeEach(async () => {
    userModel    = createMock()
    refreshModel = createMock({ find: jest.fn().mockResolvedValue([]) })
    verifyModel  = createMock()
    resetModel   = createMock()

    jwtService   = { sign: jest.fn().mockReturnValue('mock.access.token') }
    mailService  = { sendVerificationEmail: jest.fn().mockResolvedValue(undefined), sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined) }
    redis        = {
      getLoginFailures:    jest.fn().mockResolvedValue(0),
      incrementLoginFailure: jest.fn().mockResolvedValue(1),
      clearLoginFailures:  jest.fn().mockResolvedValue(undefined),
      blacklistToken:      jest.fn().mockResolvedValue(undefined),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getModelToken(User.name),               useValue: userModel    },
        { provide: getModelToken(RefreshToken.name),       useValue: refreshModel },
        { provide: getModelToken(VerificationToken.name),  useValue: verifyModel  },
        { provide: getModelToken(PasswordResetToken.name), useValue: resetModel   },
        { provide: JwtService,  useValue: jwtService  },
        { provide: MailService, useValue: mailService  },
        { provide: RedisService, useValue: redis       },
      ],
    }).compile()

    service = module.get<AuthService>(AuthService)
  })

  // ── register ───────────────────────────────────────────────────────────────

  describe('register', () => {
    it('throws EMAIL_TAKEN if email already exists', async () => {
      userModel.findOne.mockResolvedValue({ email: 'a@b.com' })
      await expect(service.register({ email:'a@b.com', password:'pass123', firstName:'A', lastName:'B' }))
        .rejects.toThrow(BadRequestException)
    })

    it('creates user with isVerified:false and sends email', async () => {
      userModel.findOne.mockResolvedValue(null)
      const fakeUser = { _id: { toString: () => 'uid1' }, email:'new@b.com', firstName:'New', toObject: () => ({ _id:'uid1', email:'new@b.com' }) }
      userModel.create.mockResolvedValue(fakeUser)
      verifyModel.create.mockResolvedValue({})

      await service.register({ email:'new@b.com', password:'pass123', firstName:'New', lastName:'User' })

      // User must be created with isVerified:false — SEC-02 requirement
      expect(userModel.create).toHaveBeenCalledWith(expect.objectContaining({ isVerified: false }))
      expect(mailService.sendVerificationEmail).toHaveBeenCalledWith('new@b.com', 'New', expect.any(String))
    })
  })

  // ── login ──────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('throws ACCOUNT_LOCKED when failure count >= 10 (SEC-05)', async () => {
      ;(redis.getLoginFailures as jest.Mock).mockResolvedValue(10)
      await expect(service.login({ email:'x@y.com', password:'wrong' }))
        .rejects.toThrow(UnauthorizedException)
    })

    it('throws INVALID_CREDENTIALS for unknown email', async () => {
      userModel.findOne.mockResolvedValue(null)
      await expect(service.login({ email:'x@y.com', password:'pass' }))
        .rejects.toThrow(UnauthorizedException)
      expect(redis.incrementLoginFailure).toHaveBeenCalledWith('x@y.com')
    })

    it('throws INVALID_CREDENTIALS for wrong password', async () => {
      const hash = await bcrypt.hash('correct', 10)
      userModel.findOne.mockResolvedValue({ email:'x@y.com', passwordHash: hash, isActive:true, isVerified:true, _id:{ toString:()=>'uid' }, toObject:()=>({}) })
      userModel.findByIdAndUpdate.mockResolvedValue({})
      await expect(service.login({ email:'x@y.com', password:'wrong' }))
        .rejects.toThrow(UnauthorizedException)
    })

    it('throws EMAIL_NOT_VERIFIED for unverified user (SEC-02)', async () => {
      const hash = await bcrypt.hash('pass', 10)
      userModel.findOne.mockResolvedValue({ email:'x@y.com', passwordHash: hash, isActive:true, isVerified:false, _id:{ toString:()=>'uid' } })
      await expect(service.login({ email:'x@y.com', password:'pass' }))
        .rejects.toThrow(UnauthorizedException)
    })

    it('clears login failure counter on success', async () => {
      const hash = await bcrypt.hash('pass123', 10)
      const fakeUser = { _id:{ toString:()=>'uid' }, email:'x@y.com', firstName:'X', role:'customer', passwordHash:hash, isActive:true, isVerified:true, toObject:()=>({_id:'uid',email:'x@y.com'}) }
      userModel.findOne.mockResolvedValue(fakeUser)
      userModel.findByIdAndUpdate.mockResolvedValue({})
      refreshModel.create = jest.fn().mockResolvedValue({})

      await service.login({ email:'x@y.com', password:'pass123' })
      expect(redis.clearLoginFailures).toHaveBeenCalledWith('x@y.com')
    })
  })

  // ── forgotPassword ─────────────────────────────────────────────────────────

  describe('forgotPassword', () => {
    it('returns same message whether email exists or not (prevents enumeration)', async () => {
      userModel.findOne.mockResolvedValue(null)
      const res1 = await service.forgotPassword({ email: 'unknown@test.com' })

      const fakeUser = { _id:{ toString:()=>'uid' }, email:'known@test.com', firstName:'K' }
      userModel.findOne.mockResolvedValue(fakeUser)
      resetModel.deleteMany = jest.fn().mockResolvedValue({})
      resetModel.create.mockResolvedValue({})
      const res2 = await service.forgotPassword({ email: 'known@test.com' })

      expect(res1.message).toEqual(res2.message)
    })
  })
})
