import { IsString, IsOptional } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

// userId has been removed from this DTO intentionally.
// It is now derived from the authenticated JWT in the controller (req.user.userId)
// so a user cannot place or read orders on behalf of another user by
// supplying a different userId in the request body.
export class CreateOrderDto {
  @ApiProperty({ description: 'Cart session ID containing the items to order' })
  @IsString()
  sessionId: string

  @ApiProperty({ description: 'Address ID from the user\'s saved addresses' })
  @IsString()
  addressId: string

  @ApiProperty({ description: 'Payment method: card | cod | wallet' })
  @IsString()
  paymentMethod: string

  @ApiPropertyOptional({ description: 'Optional order notes' })
  @IsOptional()
  @IsString()
  notes?: string
}
