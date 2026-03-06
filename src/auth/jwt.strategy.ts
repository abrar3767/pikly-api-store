import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { InjectModel }      from '@nestjs/mongoose'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { Model } from 'mongoose'
import { TokenBlacklist, TokenBlacklistDocument } from '../database/token-blacklist.schema'

// JwtStrategy runs on every authenticated request.
// Beyond the standard signature verification that Passport/JWT handles automatically,
// we add a blacklist check here so that logged-out tokens are immediately rejected
// even though they are still cryptographically valid until their expiry.
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectModel(TokenBlacklist.name)
    private readonly blacklistModel: Model<TokenBlacklistDocument>,
  ) {
    // JWT_SECRET is guaranteed to be set because main.ts validates it at startup.
    super({
      jwtFromRequest:   ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:      process.env.JWT_SECRET as string,
    })
  }

  async validate(payload: any) {
    if (!payload?.sub) throw new UnauthorizedException()

    // If the token has no jti it was issued before the blacklist was introduced;
    // we still allow it to avoid locking out existing users on upgrade.
    if (payload.jti) {
      const revoked = await this.blacklistModel.findOne({ jti: payload.jti }).lean()
      if (revoked) {
        throw new UnauthorizedException({
          code:    'TOKEN_REVOKED',
          message: 'This token has been revoked. Please log in again.',
        })
      }
    }

    return { userId: payload.sub, email: payload.email, role: payload.role }
  }
}
