import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { MongooseModule } from '@nestjs/mongoose'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { JwtStrategy } from './jwt.strategy'
import { User, UserSchema } from '../database/user.schema'
import { RefreshToken, RefreshTokenSchema } from '../database/refresh-token.schema'
import { VerificationToken, VerificationTokenSchema } from '../database/verification-token.schema'
import {
  PasswordResetToken,
  PasswordResetTokenSchema,
} from '../database/password-reset-token.schema'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: RefreshToken.name, schema: RefreshTokenSchema },
      { name: VerificationToken.name, schema: VerificationTokenSchema },
      { name: PasswordResetToken.name, schema: PasswordResetTokenSchema },
    ]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    // Access tokens are short-lived (15 minutes). Long-lived sessions are
    // maintained via the separate RefreshToken collection, not via a long
    // access token expiry. This limits the blast radius of a stolen token.
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET,
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
