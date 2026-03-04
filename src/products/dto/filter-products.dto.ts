import { IsOptional, IsString, IsNumber, IsBoolean } from "class-validator";
import { Transform, Type } from "class-transformer";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class FilterProductsDto {
  @ApiPropertyOptional({
    description: "Fuzzy search on title, brand, description, tags",
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description: "Filter by category slug e.g. electronics",
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: "Filter by subcategory e.g. laptops" })
  @IsOptional()
  @IsString()
  subcategory?: string;

  @ApiPropertyOptional({
    description: "Single or comma-separated brands: apple,samsung,sony",
  })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minPrice?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxPrice?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  rating?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  inStock?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  freeShipping?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  featured?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  bestSeller?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  newArrival?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  trending?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  topRated?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  onSale?: boolean;

  @ApiPropertyOptional({
    description: "Dynamic attribute filter: ram:16GB,storage:512GB",
  })
  @IsOptional()
  @IsString()
  attrs?: string;

  @ApiPropertyOptional({
    description:
      "Sort: price_asc | price_desc | rating_desc | newest | bestselling | discount_desc | relevance",
  })
  @IsOptional()
  @IsString()
  sort?: string;

  @ApiPropertyOptional({ description: "Include filter facets", default: false })
  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  @IsBoolean()
  includeFacets?: boolean;

  // ── OFFSET PAGINATION ──────────────────────────────
  @ApiPropertyOptional({
    description: "Page number — use either page OR cursor, not both",
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @ApiPropertyOptional({
    description: "Items per page (default: 20, max: 100)",
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;

  // ── CURSOR PAGINATION ──────────────────────────────
  @ApiPropertyOptional({
    description:
      "Cursor for cursor-based pagination — pass nextCursor from previous response. Use either cursor OR page, not both.",
    example: "cHJvZF8wMDIx",
  })
  @IsOptional()
  @IsString()
  cursor?: string;
}
