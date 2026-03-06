import { Module }         from '@nestjs/common'
import { JwtModule }      from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { MongooseModule } from '@nestjs/mongoose'
import { AuthController } from './auth.controller'
import { AuthService }    from './auth.service'
import { JwtStrategy }    from './jwt.strategy'
import { User,           UserSchema           } from '../database/user.schema'
import { TokenBlacklist, TokenBlacklistSchema } from '../database/token-blacklist.schema'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name,           schema: UserSchema           },
      { name: TokenBlacklist.name, schema: TokenBlacklistSchema },
    ]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      useFactory: () => ({
        secret:      process.env.JWT_SECRET,   // validated to exist in main.ts
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers:   [AuthService, JwtStrategy],
  exports:     [AuthService, JwtModule],
})
export class AuthModule {}
