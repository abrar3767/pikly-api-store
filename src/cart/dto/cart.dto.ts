import { IsString, IsNumber, IsOptional, Min } from 'class-validator'
import { Type } from 'class-transformer'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class AddToCartDto {
  @ApiProperty()         @IsString()                              productId:  string
  @ApiPropertyOptional() @IsOptional() @IsString()                variantId?: string
  @ApiProperty()         @Type(() => Number) @IsNumber() @Min(1)  quantity:   number
  @ApiProperty()         @IsString()                              sessionId:  string
  @ApiPropertyOptional() @IsOptional() @IsString()                userId?:    string
}

export class UpdateCartDto {
  @ApiProperty()  @IsString()                             productId:  string
  @ApiPropertyOptional() @IsOptional() @IsString()         variantId?: string
  @ApiProperty()  @Type(() => Number) @IsNumber() @Min(0)  quantity:   number
  @ApiProperty()  @IsString()                             sessionId:  string
}

export class RemoveFromCartDto {
  @ApiProperty()         @IsString()          productId:  string
  @ApiPropertyOptional() @IsOptional() @IsString() variantId?: string
  @ApiProperty()         @IsString()          sessionId:  string
}

export class ApplyCouponDto {
  @ApiProperty() @IsString() code:      string
  @ApiProperty() @IsString() sessionId: string
}

export class MergeCartDto {
  @ApiProperty() @IsString() guestSessionId: string
  @ApiProperty() @IsString() userId:         string
}
