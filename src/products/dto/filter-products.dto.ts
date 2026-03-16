import { IsOptional, IsString, IsNumber, IsBoolean } from 'class-validator'
import { Transform, Type } from 'class-transformer'
import { ApiPropertyOptional } from '@nestjs/swagger'

export class FilterProductsDto {
  @ApiPropertyOptional({ description: 'Fuzzy search on title, brand, description, tags' })
  @IsOptional() @IsString()
  q?: string

  @ApiPropertyOptional({ description: 'Filter by category slug e.g. electronics' })
  @IsOptional() @IsString()
  category?: string

  @ApiPropertyOptional({ description: 'Filter by subcategory slug' })
  @IsOptional() @IsString()
  subcategory?: string

  @ApiPropertyOptional({ description: 'Single or comma-separated brands: apple,samsung' })
  @IsOptional() @IsString()
  brand?: string

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber()
  minPrice?: number

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber()
  maxPrice?: number

  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber()
  rating?: number

  @ApiPropertyOptional({ description: 'Minimum discount percentage e.g. 25' })
  @IsOptional() @Type(() => Number) @IsNumber()
  discount?: number

  @ApiPropertyOptional({ description: 'Comma-separated colors e.g. Black,White' })
  @IsOptional() @IsString()
  color?: string

  @ApiPropertyOptional({ description: 'Comma-separated sizes e.g. S,M,L' })
  @IsOptional() @IsString()
  size?: string

  @ApiPropertyOptional({ description: 'Product condition: New | Refurbished | Used' })
  @IsOptional() @IsString()
  condition?: string

  @ApiPropertyOptional({ description: 'Warehouse: WH-East-01 | WH-West-01 | WH-Central-01 | WH-South-01' })
  @IsOptional() @IsString()
  warehouse?: string

  @ApiPropertyOptional({ description: 'New arrivals from last N days: 30 or 90' })
  @IsOptional() @Type(() => Number) @IsNumber()
  newArrivalDays?: number

  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean()
  inStock?: boolean

  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean()
  freeShipping?: boolean

  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean()
  expressAvailable?: boolean

  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean()
  featured?: boolean

  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean()
  bestSeller?: boolean

  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean()
  newArrival?: boolean

  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean()
  trending?: boolean

  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean()
  topRated?: boolean

  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean()
  onSale?: boolean

  @ApiPropertyOptional({ description: 'Dynamic attribute filter: ram:16GB,storage:512GB' })
  @IsOptional() @IsString()
  attrs?: string

  @ApiPropertyOptional({ description: 'Sort: price_asc | price_desc | rating_desc | newest | bestselling | discount_desc | relevance' })
  @IsOptional() @IsString()
  sort?: string

  @ApiPropertyOptional({ description: 'Include filter facets', default: false })
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean()
  includeFacets?: boolean

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional() @Type(() => Number) @IsNumber()
  page?: number

  @ApiPropertyOptional({ description: 'Items per page (default: 20, max: 100)', default: 20 })
  @IsOptional() @Type(() => Number) @IsNumber()
  limit?: number

  @ApiPropertyOptional({ description: 'Cursor for cursor-based pagination' })
  @IsOptional() @IsString()
  cursor?: string
}