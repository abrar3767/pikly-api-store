import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { RedisService } from '../redis/redis.service'

// SEC-06 fix: blacklist check now hits Redis (O(1) in-memory lookup) instead
// of MongoDB on every authenticated request. At 500 req/sec, this saves 500
// MongoDB queries per second compared to the previous implementation.
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly redis: RedisService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET as string,
    })
  }

  async validate(payload: any) {
    if (!payload?.sub) throw new UnauthorizedException()

    if (payload.jti) {
      const revoked = await this.redis.isTokenBlacklisted(payload.jti)
      if (revoked)
        throw new UnauthorizedException({
          code: 'TOKEN_REVOKED',
          message: 'Token has been revoked. Please log in again.',
        })
    }

    // Include jti and exp so the logout handler can blacklist the token.
    // Without these, req.user.jti / req.user.exp are undefined and the
    // blacklist call in AuthService.logout() is silently skipped.
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      jti: payload.jti, // unique token ID — used to blacklist on logout
      exp: payload.exp, // Unix timestamp — used to set Redis TTL
    }
  }
}
