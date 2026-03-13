import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { JwtService } from '@nestjs/jwt'
import { Model } from 'mongoose'
import * as bcrypt from 'bcrypt'
import * as crypto from 'crypto'
import { User, UserDocument } from '../database/user.schema'
import { RefreshToken, RefreshTokenDocument } from '../database/refresh-token.schema'
import { VerificationToken, VerificationTokenDocument } from '../database/verification-token.schema'
import {
  PasswordResetToken,
  PasswordResetTokenDocument,
} from '../database/password-reset-token.schema'
import { MailService } from '../mail/mail.service'
import { RedisService } from '../redis/redis.service'
import {
  RegisterDto,
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  VerifyEmailDto,
  ChangePasswordDto,
} from './dto/auth.dto'

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,

    @InjectModel(RefreshToken.name)
    private readonly refreshTokenModel: Model<RefreshTokenDocument>,

    @InjectModel(VerificationToken.name)
    private readonly verificationTokenModel: Model<VerificationTokenDocument>,

    @InjectModel(PasswordResetToken.name)
    private readonly passwordResetTokenModel: Model<PasswordResetTokenDocument>,

    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly redis: RedisService,
  ) {}

  // ── Helpers ──────────────────────────────────────────────────────────────

  private safe(user: any) {
    const obj = user.toObject ? user.toObject() : { ...user }
    const { passwordHash, ...rest } = obj
    return { ...rest, id: obj._id?.toString() }
  }

  private signAccess(user: any): string {
    return this.jwtService.sign({
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
      jti: crypto.randomUUID(),
    })
  }

  private async createRefreshToken(userId: string): Promise<string> {
    const raw = `${userId}.${crypto.randomBytes(64).toString('hex')}`
    const hash = await bcrypt.hash(raw, 10)
    const exp = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    await this.refreshTokenModel.create({ userId, tokenHash: hash, expiresAt: exp })
    return raw
  }

  // ── Register ─────────────────────────────────────────────────────────────

  async register(dto: RegisterDto) {
    const existing = await this.userModel.findOne({ email: dto.email.toLowerCase() })
    if (existing)
      throw new BadRequestException({ code: 'EMAIL_TAKEN', message: 'Email already registered' })

    const hash = await bcrypt.hash(dto.password, 12)
    const user = await this.userModel.create({
      email: dto.email.toLowerCase(),
      passwordHash: hash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      isVerified: false,
      isActive: true,
      role: 'customer',
      addresses: [],
      wishlist: [],
      recentlyViewed: [],
      loyaltyPoints: 0,
      lastLogin: new Date(),
    })

    const verToken = crypto.randomBytes(32).toString('hex')
    await this.verificationTokenModel.create({
      userId: user._id.toString(),
      token: verToken,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    })
    await this.mailService.sendVerificationEmail(user.email, user.firstName, verToken)

    return { message: 'Registration successful. Please check your email to verify your account.' }
  }

  // ── Verify email ──────────────────────────────────────────────────────────
  // SEC-02: the query now includes expiresAt: { $gt: new Date() } so application
  // code enforces expiry immediately, regardless of whether MongoDB's TTL index
  // cleanup has run yet. Previously a token could be used for up to ~60 seconds
  // after its expiry time during the TTL cleanup window.

  async verifyEmail(dto: VerifyEmailDto) {
    const record = await this.verificationTokenModel.findOne({
      token: dto.token,
      expiresAt: { $gt: new Date() }, // SEC-02: explicit expiry check
    })
    if (!record)
      throw new BadRequestException({
        code: 'INVALID_TOKEN',
        message: 'Verification link is invalid or has expired',
      })

    await this.userModel.findByIdAndUpdate(record.userId, { isVerified: true })
    await this.verificationTokenModel.deleteOne({ _id: record._id })
    return { message: 'Email verified successfully. You can now log in.' }
  }

  // ── Login ─────────────────────────────────────────────────────────────────

  async login(dto: LoginDto) {
    const failures = await this.redis.getLoginFailures(dto.email)
    if (failures >= 10)
      throw new UnauthorizedException({
        code: 'ACCOUNT_LOCKED',
        message: 'Too many failed attempts. Account locked for 15 minutes.',
      })

    const user = await this.userModel.findOne({ email: dto.email.toLowerCase() })
    const valid = user ? await bcrypt.compare(dto.password, user.passwordHash) : false

    if (!user || !valid) {
      await this.redis.incrementLoginFailure(dto.email)
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      })
    }

    if (!user.isActive)
      throw new UnauthorizedException({ code: 'ACCOUNT_BANNED', message: 'Account suspended' })
    if (!user.isVerified)
      throw new UnauthorizedException({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Please verify your email before logging in.',
      })

    await this.redis.clearLoginFailures(dto.email)
    await this.userModel.findByIdAndUpdate(user._id, { lastLogin: new Date() })

    const accessToken = this.signAccess(user)
    const refreshToken = await this.createRefreshToken(user._id.toString())
    return { user: this.safe(user), accessToken, refreshToken, expiresIn: '15m' }
  }

  // ── Refresh access token ───────────────────────────────────────────────────

  async refreshTokens(rawRefreshToken: string) {
    const dotIdx = rawRefreshToken.indexOf('.')
    if (dotIdx === -1) {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Refresh token is invalid or expired',
      })
    }
    const userId = rawRefreshToken.slice(0, dotIdx)

    const candidates = await this.refreshTokenModel
      .find({
        userId,
        expiresAt: { $gt: new Date() },
      })
      .lean()

    let matchedDoc: any = null
    for (const doc of candidates) {
      if (await bcrypt.compare(rawRefreshToken, doc.tokenHash)) {
        matchedDoc = doc
        break
      }
    }

    if (!matchedDoc)
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Refresh token is invalid or expired',
      })

    const user = await this.userModel.findById(matchedDoc.userId)
    if (!user || !user.isActive) throw new UnauthorizedException({ code: 'USER_INACTIVE' })

    await this.refreshTokenModel.deleteOne({ _id: matchedDoc._id })
    const accessToken = this.signAccess(user)
    const refreshToken = await this.createRefreshToken(user._id.toString())
    return { accessToken, refreshToken, expiresIn: '15m' }
  }

  // ── Logout ────────────────────────────────────────────────────────────────

  async logout(jti: string, exp: number, rawRefreshToken?: string) {
    if (jti && exp) {
      await this.redis.blacklistToken(jti, new Date(exp * 1000))
    }
    if (rawRefreshToken) {
      const dotIdx = rawRefreshToken.indexOf('.')
      if (dotIdx !== -1) {
        const userId = rawRefreshToken.slice(0, dotIdx)
        const candidates = await this.refreshTokenModel
          .find({
            userId,
            expiresAt: { $gt: new Date() },
          })
          .lean()
        for (const doc of candidates) {
          if (await bcrypt.compare(rawRefreshToken, doc.tokenHash)) {
            await this.refreshTokenModel.deleteOne({ _id: doc._id })
            break
          }
        }
      }
    }
    return { message: 'Logged out successfully' }
  }

  // ── Forgot password ───────────────────────────────────────────────────────

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.userModel.findOne({ email: dto.email.toLowerCase() })
    if (user) {
      await this.passwordResetTokenModel.deleteMany({ userId: user._id.toString() })
      const token = crypto.randomBytes(32).toString('hex')
      await this.passwordResetTokenModel.create({
        userId: user._id.toString(),
        token,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      })
      await this.mailService.sendPasswordResetEmail(user.email, user.firstName, token)
    }
    return { message: 'If that email is registered, a reset link has been sent.' }
  }

  // ── Reset password ────────────────────────────────────────────────────────
  // SEC-02: added expiresAt: { $gt: new Date() } — same reasoning as verifyEmail.
  // The MongoDB TTL index deletes expired tokens eventually, but between the
  // token's expiry time and the next TTL cleanup cycle (up to 60 seconds), the
  // token remains in the collection and was previously usable. This fix closes
  // that window by rejecting expired tokens in application code unconditionally.

  async resetPassword(dto: ResetPasswordDto) {
    const record = await this.passwordResetTokenModel.findOne({
      token: dto.token,
      expiresAt: { $gt: new Date() }, // SEC-02: explicit expiry check
    })
    if (!record)
      throw new BadRequestException({
        code: 'INVALID_TOKEN',
        message: 'Reset link is invalid or has expired',
      })

    const newHash = await bcrypt.hash(dto.newPassword, 12)
    await this.userModel.findByIdAndUpdate(record.userId, { passwordHash: newHash })
    await this.refreshTokenModel.deleteMany({ userId: record.userId })
    await this.passwordResetTokenModel.deleteOne({ _id: record._id })
    return { message: 'Password reset successfully. Please log in with your new password.' }
  }

  // ── Change password ───────────────────────────────────────────────────────

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.userModel.findById(userId)
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND' })
    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash)
    if (!valid)
      throw new BadRequestException({
        code: 'WRONG_PASSWORD',
        message: 'Current password is incorrect',
      })

    const newHash = await bcrypt.hash(dto.newPassword, 12)
    await this.userModel.findByIdAndUpdate(userId, { passwordHash: newHash })
    await this.refreshTokenModel.deleteMany({ userId })
    return { message: 'Password changed. Please log in again.' }
  }

  // ── Resend verification email ─────────────────────────────────────────────

  async resendVerification(email: string) {
    const user = await this.userModel.findOne({ email: email.toLowerCase() })
    if (user && !user.isVerified) {
      await this.verificationTokenModel.deleteMany({ userId: user._id.toString() })
      const token = crypto.randomBytes(32).toString('hex')
      await this.verificationTokenModel.create({
        userId: user._id.toString(),
        token,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })
      await this.mailService.sendVerificationEmail(user.email, user.firstName, token)
    }
    return { message: 'If your account exists and is unverified, a new link has been sent.' }
  }
}
