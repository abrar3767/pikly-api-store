import { IsString, IsEmail, MinLength, MaxLength } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string

  @ApiProperty({ example: 'strongPassword123', minLength: 6 })
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password: string

  @ApiProperty({ example: 'John' })
  @IsString()
  @MaxLength(100)
  firstName: string

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @MaxLength(100)
  lastName: string
}

export class LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string

  @ApiProperty({ example: 'strongPassword123' })
  @IsString()
  @MaxLength(128)
  password: string
}

export class RefreshTokenDto {
  @ApiProperty({ description: 'The JWT token to refresh (can be expired, max 30 days old)' })
  @IsString()
  token: string
}
