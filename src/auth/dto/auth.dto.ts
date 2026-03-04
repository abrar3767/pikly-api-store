import { IsString, IsEmail, MinLength } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class RegisterDto {
  @ApiProperty() @IsEmail()              email:     string
  @ApiProperty() @IsString() @MinLength(6) password: string
  @ApiProperty() @IsString()             firstName: string
  @ApiProperty() @IsString()             lastName:  string
}

export class LoginDto {
  @ApiProperty() @IsEmail()   email:    string
  @ApiProperty() @IsString()  password: string
}

export class RefreshTokenDto {
  @ApiProperty() @IsString() token: string
}
