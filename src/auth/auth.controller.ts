import { Controller, Post, Body, UseGuards, Request, HttpCode, HttpStatus } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { AuthGuard }     from '@nestjs/passport'
import { Throttle }      from '@nestjs/throttler'
import { AuthService }   from './auth.service'
import { successResponse } from '../common/api-utils'
import { RegisterDto, LoginDto, RefreshTokenDto } from './dto/auth.dto'

// Auth endpoints have much tighter rate limits than the global 100 req/min:
// - register: 5 per minute (prevents mass account creation)
// - login: 10 per minute (prevents brute-force password guessing)
// - refresh: 20 per minute (refresh calls can be slightly more frequent)
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiOperation({ summary: 'Register a new user account' })
  async register(@Body() dto: RegisterDto) {
    const data = await this.authService.register(dto)
    return successResponse(data)
  }

  @Post('login')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login and receive JWT token' })
  async login(@Body() dto: LoginDto) {
    const data = await this.authService.login(dto)
    return successResponse(data)
  }

  // Logout requires a valid token so we know which jti to blacklist.
  // The bearer token in the Authorization header is the one that gets revoked.
  @Post('logout')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout and invalidate the current token' })
  async logout(@Request() req: any) {
    const rawToken = req.headers.authorization?.split(' ')[1] ?? ''
    const data = await this.authService.logout(rawToken)
    return successResponse(data)
  }

  @Post('refresh-token')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange an expired token for a new one (max 30 days old)' })
  async refresh(@Body() dto: RefreshTokenDto) {
    const data = await this.authService.refreshToken(dto)
    return successResponse(data)
  }
}
