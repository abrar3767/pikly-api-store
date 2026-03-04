import { IsString, IsOptional, IsArray, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class OrderItemDto {
  @ApiProperty() @IsString() productId:  string
  @ApiPropertyOptional() @IsOptional() @IsString() variantId?: string
  @ApiProperty() quantity: number
}

export class CreateOrderDto {
  @ApiProperty() @IsString() userId:    string
  @ApiProperty() @IsString() sessionId: string
  @ApiProperty() @IsString() addressId: string
  @ApiProperty() @IsString() paymentMethod: string
  @ApiPropertyOptional() @IsOptional() @IsString() couponCode?: string
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string
}
