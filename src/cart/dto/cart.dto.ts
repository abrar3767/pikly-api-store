import { IsString, IsNumber, IsOptional, Min } from 'class-validator'
import { Type } from 'class-transformer'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class AddToCartDto {
  @ApiProperty()         @IsString()                              productId:  string
  @ApiPropertyOptional() @IsOptional() @IsString()                variantId?: string
  @ApiProperty()         @Type(() => Number) @IsNumber() @Min(1)  quantity:   number
  @ApiProperty()         @IsString()                              sessionId:  string
}

export class UpdateCartDto {
  @ApiProperty()         @IsString()                             productId:  string
  @ApiPropertyOptional() @IsOptional() @IsString()               variantId?: string
  @ApiProperty()         @Type(() => Number) @IsNumber() @Min(0) quantity:   number
  @ApiProperty()         @IsString()                             sessionId:  string
}

export class RemoveFromCartDto {
  @ApiProperty()         @IsString()                    productId:  string
  @ApiPropertyOptional() @IsOptional() @IsString()       variantId?: string
  @ApiProperty()         @IsString()                    sessionId:  string
}

export class ApplyCouponDto {
  @ApiProperty() @IsString() code:      string
  @ApiProperty() @IsString() sessionId: string
}

// userId has been removed from MergeCartDto — it now comes from the JWT
// in the controller (req.user.userId) to prevent IDOR.
export class MergeCartDto {
  @ApiProperty({ description: 'The guest sessionId to merge from' })
  @IsString()
  guestSessionId: string

  // Internal use only — set by the controller from req.user.userId, never from the client.
  userId?: string
}
