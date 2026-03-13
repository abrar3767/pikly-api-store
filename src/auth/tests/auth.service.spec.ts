import { Test, TestingModule } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { JwtService } from '@nestjs/jwt'
import { BadRequestException, UnauthorizedException } from '@nestjs/common'
import { AuthService } from '../auth.service'
import { MailService } from '../../mail/mail.service'
import { RedisService } from '../../redis/redis.service'
import { User } from '../../database/user.schema'
import { RefreshToken } from '../../database/refresh-token.schema'
import { VerificationToken } from '../../database/verification-token.schema'
import { PasswordResetToken } from '../../database/password-reset-token.schema'
import * as bcrypt from 'bcrypt'

// Helper that creates a Mongoose-style chainable mock where find() returns an
// object with a .lean() method. This matches the actual call pattern in
// auth.service.ts: this.refreshTokenModel.find(...).lean()
// Without this, jest.fn().mockResolvedValue([]) resolves the Promise at the
// find() call itself and .lean() does not exist on a Promise, causing
// "find(...).lean is not a function".
const makeFindMock = (resolvedValue: any[]) =>
  jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(resolvedValue) })

const createMock = (overrides: Record<string, any> = {}) => ({
  findOne: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  create: jest.fn(),
  deleteMany: jest.fn(),
  deleteOne: jest.fn(),
  find: makeFindMock([]),
  ...overrides,
})

describe('AuthService', () => {
  let service: AuthService
  let userModel: ReturnType<typeof createMock>
  let refreshModel: ReturnType<typeof createMock>
  let verifyModel: ReturnType<typeof createMock>
  let resetModel: ReturnType<typeof createMock>
  let jwtService: jest.Mocked<Partial<JwtService>>
  let mailService: jest.Mocked<Partial<MailService>>
  let redis: jest.Mocked<Partial<RedisService>>

  let testingModule: TestingModule

  beforeEach(async () => {
    userModel = createMock()
    refreshModel = createMock({ find: makeFindMock([]) })
    verifyModel = createMock()
    resetModel = createMock()

    jwtService = { sign: jest.fn().mockReturnValue('mock.access.token') }
    mailService = {
      sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    }
    redis = {
      getLoginFailures: jest.fn().mockResolvedValue(0),
      incrementLoginFailure: jest.fn().mockResolvedValue(1),
      clearLoginFailures: jest.fn().mockResolvedValue(undefined),
      blacklistToken: jest.fn().mockResolvedValue(undefined),
    }

    testingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: getModelToken(RefreshToken.name), useValue: refreshModel },
        { provide: getModelToken(VerificationToken.name), useValue: verifyModel },
        { provide: getModelToken(PasswordResetToken.name), useValue: resetModel },
        { provide: JwtService, useValue: jwtService },
        { provide: MailService, useValue: mailService },
        { provide: RedisService, useValue: redis },
      ],
    }).compile()

    service = testingModule.get<AuthService>(AuthService)
  })

  afterAll(async () => {
    await testingModule?.close()
  })

  // ── register ───────────────────────────────────────────────────────────────

  describe('register', () => {
    it('throws EMAIL_TAKEN if email already exists', async () => {
      userModel.findOne.mockResolvedValue({ email: 'a@b.com' })
      await expect(
        service.register({ email: 'a@b.com', password: 'pass123', firstName: 'A', lastName: 'B' }),
      ).rejects.toThrow(BadRequestException)
    })

    it('creates user with isVerified:false and sends verification email', async () => {
      userModel.findOne.mockResolvedValue(null)
      const fakeUser = {
        _id: { toString: () => 'uid1' },
        email: 'new@b.com',
        firstName: 'New',
        toObject: () => ({ _id: 'uid1', email: 'new@b.com' }),
      }
      userModel.create.mockResolvedValue(fakeUser)
      verifyModel.create.mockResolvedValue({})

      const result = await service.register({
        email: 'new@b.com',
        password: 'pass123',
        firstName: 'New',
        lastName: 'User',
      })
      expect(result.message).toContain('verify your account')
      expect(userModel.create).toHaveBeenCalledWith(expect.objectContaining({ isVerified: false }))
      expect(mailService.sendVerificationEmail).toHaveBeenCalled()
    })
  })

  // ── verifyEmail ────────────────────────────────────────────────────────────

  describe('verifyEmail', () => {
    it('marks user as verified when token is valid', async () => {
      verifyModel.findOne.mockResolvedValue({ _id: 'vid1', userId: 'uid1', token: 'abc' })
      userModel.findByIdAndUpdate.mockResolvedValue({})
      verifyModel.deleteOne.mockResolvedValue({})

      const result = await service.verifyEmail({ token: 'abc' })
      expect(result.message).toContain('verified')
      expect(userModel.findByIdAndUpdate).toHaveBeenCalledWith('uid1', { isVerified: true })
    })

    it('throws INVALID_TOKEN when token is expired (SEC-02 — query returns null)', async () => {
      verifyModel.findOne.mockResolvedValue(null)
      await expect(service.verifyEmail({ token: 'expired-token' })).rejects.toThrow(
        BadRequestException,
      )
    })
  })

  // ── resetPassword ──────────────────────────────────────────────────────────

  describe('resetPassword', () => {
    it('throws INVALID_TOKEN when reset token is expired (SEC-02 — query returns null)', async () => {
      resetModel.findOne.mockResolvedValue(null)
      await expect(
        service.resetPassword({ token: 'stale', newPassword: 'newpass123' }),
      ).rejects.toThrow(BadRequestException)
    })

    it('updates password hash and deletes token on valid reset', async () => {
      resetModel.findOne.mockResolvedValue({ _id: 'rtid1', userId: 'uid1', token: 'valid' })
      userModel.findByIdAndUpdate.mockResolvedValue({})
      refreshModel.deleteMany.mockResolvedValue({})
      resetModel.deleteOne.mockResolvedValue({})

      const result = await service.resetPassword({ token: 'valid', newPassword: 'newpass123' })
      expect(result.message).toContain('reset successfully')
      expect(resetModel.deleteOne).toHaveBeenCalledWith({ _id: 'rtid1' })
    })
  })

  // ── login ──────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('throws ACCOUNT_LOCKED after 10 failed attempts', async () => {
      ;(redis.getLoginFailures as jest.Mock).mockResolvedValue(10)
      await expect(service.login({ email: 'x@x.com', password: 'wrong' })).rejects.toThrow(
        UnauthorizedException,
      )
    })

    it('throws INVALID_CREDENTIALS for wrong password', async () => {
      const user = {
        passwordHash: await bcrypt.hash('correct', 10),
        isActive: true,
        isVerified: true,
      }
      userModel.findOne.mockResolvedValue(user)
      await expect(service.login({ email: 'x@x.com', password: 'wrong' })).rejects.toThrow(
        UnauthorizedException,
      )
    })

    it('throws EMAIL_NOT_VERIFIED for unverified users', async () => {
      const user = {
        _id: { toString: () => 'uid1' },
        passwordHash: await bcrypt.hash('pass', 10),
        isActive: true,
        isVerified: false,
      }
      userModel.findOne.mockResolvedValue(user)
      await expect(service.login({ email: 'x@x.com', password: 'pass' })).rejects.toThrow(
        UnauthorizedException,
      )
    })

    it('returns tokens and clears failure counter on successful login', async () => {
      const user = {
        _id: { toString: () => 'uid1' },
        email: 'x@x.com',
        role: 'customer',
        passwordHash: await bcrypt.hash('pass', 10),
        isActive: true,
        isVerified: true,
        toObject: () => ({ _id: 'uid1', email: 'x@x.com' }),
      }
      userModel.findOne.mockResolvedValue(user)
      userModel.findByIdAndUpdate.mockResolvedValue({})
      refreshModel.create.mockResolvedValue({})

      const result = await service.login({ email: 'x@x.com', password: 'pass' })
      expect(result.accessToken).toBe('mock.access.token')
      expect(result.refreshToken).toBeDefined()
      expect(redis.clearLoginFailures).toHaveBeenCalledWith('x@x.com')
    })
  })

  // ── refreshTokens ──────────────────────────────────────────────────────────

  describe('refreshTokens', () => {
    it('deletes old refresh token and issues new access + refresh tokens', async () => {
      const userId = 'uid1'
      const rawToken = `${userId}.${'a'.repeat(128)}`
      const tokenHash = await bcrypt.hash(rawToken, 10)

      // find().lean() must return an array — use makeFindMock on this specific call
      refreshModel.find.mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            _id: 'rtid1',
            userId,
            tokenHash,
            expiresAt: new Date(Date.now() + 1_000_000),
          },
        ]),
      })
      refreshModel.deleteOne.mockResolvedValue({})
      refreshModel.create.mockResolvedValue({})
      userModel.findById.mockResolvedValue({
        _id: { toString: () => userId },
        email: 'x@x.com',
        role: 'customer',
        isActive: true,
        toObject: () => ({}),
      })

      const result = await service.refreshTokens(rawToken)
      expect(result.accessToken).toBe('mock.access.token')
      expect(result.refreshToken).toBeDefined()
      expect(refreshModel.deleteOne).toHaveBeenCalledWith({ _id: 'rtid1' })
    })

    it('throws INVALID_REFRESH_TOKEN when no candidate tokens exist', async () => {
      const rawToken = `uid1.${'b'.repeat(128)}`
      refreshModel.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) })
      await expect(service.refreshTokens(rawToken)).rejects.toThrow(UnauthorizedException)
    })

    it('throws if raw token has no dot separator', async () => {
      await expect(service.refreshTokens('nodottoken')).rejects.toThrow(UnauthorizedException)
    })
  })

  // ── logout ─────────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('blacklists the access token jti in Redis', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 900
      await service.logout('jti-123', futureExp)
      expect(redis.blacklistToken).toHaveBeenCalledWith('jti-123', new Date(futureExp * 1000))
    })

    it('returns success message without throwing even if no refresh token provided', async () => {
      const result = await service.logout('jti-xyz', Math.floor(Date.now() / 1000) + 900)
      expect(result.message).toContain('Logged out')
    })
  })
})
