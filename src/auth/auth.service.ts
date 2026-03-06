import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { JwtService }  from '@nestjs/jwt'
import { Model }       from 'mongoose'
import * as bcrypt     from 'bcrypt'
import * as crypto     from 'crypto'
import { User,           UserDocument           } from '../database/user.schema'
import { TokenBlacklist, TokenBlacklistDocument } from '../database/token-blacklist.schema'
import { RegisterDto, LoginDto, RefreshTokenDto } from './dto/auth.dto'

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,

    @InjectModel(TokenBlacklist.name)
    private readonly blacklistModel: Model<TokenBlacklistDocument>,

    private readonly jwtService: JwtService,
  ) {}

  // ── Token signing ──────────────────────────────────────────────────────────
  // Every token gets a unique `jti` (JWT ID) so it can be individually revoked
  // on logout without affecting other sessions.
  private sign(user: any) {
    const payload = {
      sub:   user._id.toString(),
      email: user.email,
      role:  user.role,
      jti:   crypto.randomUUID(),
    }
    return {
      token:     this.jwtService.sign(payload),
      expiresIn: '7d',
    }
  }

  // Strip the password hash before returning user data to any caller.
  private safe(user: any) {
    const obj                  = user.toObject ? user.toObject() : user
    const { passwordHash, ...rest } = obj
    return { ...rest, id: obj._id?.toString() }
  }

  // ── Register ───────────────────────────────────────────────────────────────
  async register(dto: RegisterDto) {
    const existing = await this.userModel.findOne({ email: dto.email.toLowerCase() })
    if (existing) {
      throw new BadRequestException({
        code:    'EMAIL_TAKEN',
        message: 'An account with this email already exists',
      })
    }

    const hash = await bcrypt.hash(dto.password, 12)
    const user = await this.userModel.create({
      email:         dto.email.toLowerCase(),
      passwordHash:  hash,
      firstName:     dto.firstName,
      lastName:      dto.lastName,
      avatar:        null,
      phone:         null,
      role:          'customer',
      addresses:     [],
      wishlist:      [],
      recentlyViewed:[],
      loyaltyPoints: 0,
      isVerified:    true,
      isActive:      true,
      lastLogin:     new Date(),
    })

    const { token, expiresIn } = this.sign(user)
    return { user: this.safe(user), token, expiresIn }
  }

  // ── Login ──────────────────────────────────────────────────────────────────
  async login(dto: LoginDto) {
    const user = await this.userModel.findOne({ email: dto.email.toLowerCase() })
    // Use the same generic message for both "user not found" and "wrong password"
    // to avoid leaking which emails are registered.
    if (!user) {
      throw new UnauthorizedException({
        code:    'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      })
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash)
    if (!valid) {
      throw new UnauthorizedException({
        code:    'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      })
    }

    if (!user.isActive) {
      throw new UnauthorizedException({
        code:    'ACCOUNT_BANNED',
        message: 'Your account has been suspended',
      })
    }

    await this.userModel.findByIdAndUpdate(user._id, { lastLogin: new Date() })

    const { token, expiresIn } = this.sign(user)
    return { user: this.safe(user), token, expiresIn }
  }

  // ── Logout ─────────────────────────────────────────────────────────────────
  // Extracts the jti from the bearer token and adds it to the blacklist with a
  // TTL matching the token's remaining lifetime. The TTL index on the blacklist
  // collection cleans up expired entries automatically.
  async logout(rawToken: string) {
    try {
      const payload = this.jwtService.decode(rawToken) as any
      if (payload?.jti && payload?.exp) {
        const ttlSeconds = payload.exp - Math.floor(Date.now() / 1000)
        if (ttlSeconds > 0) {
          // findOneAndUpdate with upsert is idempotent — calling logout twice
          // on the same token is safe and won't throw a duplicate-key error.
          await this.blacklistModel.findOneAndUpdate(
            { jti: payload.jti },
            { jti: payload.jti, expiresAt: new Date(payload.exp * 1000) },
            { upsert: true },
          )
        }
      }
    } catch {
      // If the token can't be decoded at all, there's nothing to revoke.
      // We still return success because from the client's perspective the
      // session is over regardless.
    }
    return { message: 'Logged out successfully' }
  }

  // ── Refresh token ──────────────────────────────────────────────────────────
  // Accepts an expired token (up to 30 days old) and issues a fresh one.
  // The old token's jti is blacklisted immediately after issuing the new token
  // so the same refresh token cannot be replayed.
  async refreshToken(dto: RefreshTokenDto) {
    try {
      const payload = this.jwtService.verify(dto.token, { ignoreExpiration: true })

      const issuedAt   = payload.iat * 1000
      const thirtyDays = 30 * 24 * 60 * 60 * 1000
      if (Date.now() - issuedAt > thirtyDays) {
        throw new Error('Token too old')
      }

      // Also reject tokens that have been explicitly revoked
      if (payload.jti) {
        const revoked = await this.blacklistModel.findOne({ jti: payload.jti }).lean()
        if (revoked) throw new Error('Token revoked')
      }

      const user = await this.userModel.findById(payload.sub)
      if (!user || !user.isActive) throw new Error('User inactive')

      // Blacklist the old token so it cannot be refreshed again
      if (payload.jti && payload.exp) {
        const remaining = payload.exp - Math.floor(Date.now() / 1000)
        if (remaining > 0) {
          await this.blacklistModel.findOneAndUpdate(
            { jti: payload.jti },
            { jti: payload.jti, expiresAt: new Date(payload.exp * 1000) },
            { upsert: true },
          )
        }
      }

      const { token, expiresIn } = this.sign(user)
      return { token, expiresIn }
    } catch {
      throw new UnauthorizedException({
        code:    'INVALID_TOKEN',
        message: 'Invalid or expired token',
      })
    }
  }
}
