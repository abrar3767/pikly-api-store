import { Controller, Post, Body } from '@nestjs/common'
import { ApiTags, ApiOperation }  from '@nestjs/swagger'
import { AuthService }     from './auth.service'
import { successResponse } from '../common/api-utils'
import { RegisterDto, LoginDto, RefreshTokenDto } from './dto/auth.dto'

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user account' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto).then(data => successResponse(data))
  }

  @Post('login')
  @ApiOperation({ summary: 'Login and receive JWT token' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto).then(data => successResponse(data))
  }

  @Post('logout')
  @ApiOperation({ summary: 'Logout current session' })
  logout() {
    return successResponse(this.authService.logout())
  }

  @Post('refresh-token')
  @ApiOperation({ summary: 'Refresh JWT token' })
  refresh(@Body() dto: RefreshTokenDto) {
    return successResponse(this.authService.refreshToken(dto))
  }
}
