import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt    from 'bcrypt'
import * as fs        from 'fs'
import * as path      from 'path'
import { RegisterDto, LoginDto, RefreshTokenDto } from './dto/auth.dto'

@Injectable()
export class AuthService {
  private users: any[] = []

  constructor(private readonly jwtService: JwtService) {
    this.load()
  }

  private load() {
    try {
      this.users = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'users.json'), 'utf-8'))
    } catch { this.users = [] }
  }

  private sign(user: any) {
    const payload = { sub: user.id, email: user.email, role: user.role }
    return {
      token:     this.jwtService.sign(payload),
      expiresIn: '7d',
    }
  }

  async register(dto: RegisterDto) {
    const existing = this.users.find(u => u.email.toLowerCase() === dto.email.toLowerCase())
    if (existing) throw new BadRequestException({ code: 'EMAIL_TAKEN', message: 'An account with this email already exists' })

    const id   = `usr_${String(this.users.length + 1).padStart(3, '0')}`
    const hash = await bcrypt.hash(dto.password, 10)
    const now  = new Date().toISOString()

    const user = {
      id,
      email:        dto.email.toLowerCase(),
      passwordHash: hash,
      firstName:    dto.firstName,
      lastName:     dto.lastName,
      avatar:       null,
      phone:        null,
      role:         'customer',
      addresses:    [],
      wishlist:     [],
      loyaltyPoints: 0,
      memberSince:  now,
      lastLogin:    now,
      isVerified:   true,
      isActive:     true,
    }

    this.users.push(user)
    const { token, expiresIn } = this.sign(user)
    const { passwordHash, ...safeUser } = user
    return { user: safeUser, token, expiresIn }
  }

  async login(dto: LoginDto) {
    const user = this.users.find(u => u.email.toLowerCase() === dto.email.toLowerCase())
    if (!user) throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' })

    const valid = await bcrypt.compare(dto.password, user.passwordHash)
    if (!valid)  throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' })

    user.lastLogin = new Date().toISOString()
    const { token, expiresIn } = this.sign(user)
    const { passwordHash, ...safeUser } = user
    return { user: safeUser, token, expiresIn }
  }

  logout() {
    return { message: 'Logged out successfully' }
  }

  refreshToken(dto: RefreshTokenDto) {
    try {
      const payload = this.jwtService.verify(dto.token, { ignoreExpiration: true })
      const user    = this.users.find(u => u.id === payload.sub)
      if (!user || !user.isActive) throw new UnauthorizedException()
      const { token, expiresIn } = this.sign(user)
      return { token, expiresIn }
    } catch {
      throw new UnauthorizedException({ code: 'INVALID_TOKEN', message: 'Invalid or malformed token' })
    }
  }
}
