import { IsString, IsEmail, MinLength, MaxLength, IsNotEmpty, IsOptional } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class RegisterDto {
  @ApiProperty() @IsEmail()                              email:     string
  @ApiProperty() @IsString() @MinLength(6) @MaxLength(128) password: string
  @ApiProperty() @IsString() @MaxLength(100)             firstName: string
  @ApiProperty() @IsString() @MaxLength(100)             lastName:  string
}

export class LoginDto {
  @ApiProperty() @IsEmail()                  email:    string
  @ApiProperty() @IsString() @MaxLength(128) password: string
}

export class RefreshTokenDto {
  @ApiProperty() @IsString() @IsNotEmpty() refreshToken: string
}

export class LogoutDto {
  // @IsOptional() is required here — without it, class-validator throws a 400
  // when the client sends {} as the body (refreshToken is undefined, and @IsString()
  // without @IsOptional() fails on undefined even though the field is TypeScript-optional).
  @ApiProperty({ required: false }) @IsOptional() @IsString() refreshToken?: string
}

export class ForgotPasswordDto {
  @ApiProperty() @IsEmail() email: string
}

export class ResetPasswordDto {
  @ApiProperty() @IsString() @IsNotEmpty()                 token:       string
  @ApiProperty() @IsString() @MinLength(6) @MaxLength(128) newPassword: string
}

export class VerifyEmailDto {
  @ApiProperty() @IsString() @IsNotEmpty() token: string
}

export class ChangePasswordDto {
  @ApiProperty() @IsString() @MaxLength(128) currentPassword: string
  @ApiProperty() @IsString() @MinLength(6) @MaxLength(128) newPassword: string
}

export class ResendVerificationDto {
  @ApiProperty() @IsEmail() email: string
}
