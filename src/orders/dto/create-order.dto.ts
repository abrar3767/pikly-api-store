import { IsString, IsOptional, IsIn } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class CreateOrderDto {
  @ApiProperty() @IsString() sessionId:     string
  @ApiProperty() @IsString() addressId:     string
  // SCH-04 fix: enum validation so only valid payment methods are accepted
  @ApiProperty({ enum: ['card','cod','wallet'] })
  @IsIn(['card','cod','wallet'])
  paymentMethod: string

  @ApiPropertyOptional() @IsOptional() @IsString() notes?:           string
  // DES-03: optional idempotency key to prevent duplicate orders on retry
  @ApiPropertyOptional({ description: 'Unique key to prevent duplicate orders on client retry' })
  @IsOptional() @IsString()
  idempotencyKey?: string
}
