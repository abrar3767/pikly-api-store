import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { ProductsService } from "../products/products.service";

// CompareService no longer reads products.json itself. It injects ProductsService
// and reads from its already-loaded in-memory array. This eliminates one of the
// 10 redundant file reads identified in Bug #19. The comparison logic itself is
// unchanged — only the data source has been replaced.

@Injectable()
export class CompareService {
  constructor(private readonly productsService: ProductsService) {}

  compare(productIds: string[]) {
    if (productIds.length < 2)
      throw new BadRequestException({
        code: "MIN_PRODUCTS",
        message: "At least 2 products required for comparison",
      });
    if (productIds.length > 4)
      throw new BadRequestException({
        code: "MAX_PRODUCTS",
        message: "Maximum 4 products can be compared at once",
      });

    const products = productIds.map((id) => {
      const p = this.productsService.products.find(
        (p) => p.id === id && p.isActive,
      );
      if (!p)
        throw new NotFoundException({
          code: "PRODUCT_NOT_FOUND",
          message: `Product ${id} not found`,
        });
      return p;
    });

    // Collect all attribute keys that exist across any of the selected products
    const allAttrKeys = [
      ...new Set(products.flatMap((p) => Object.keys(p.attributes ?? {}))),
    ];

    const attributeComparison: Record<string, any> = {};
    for (const key of allAttrKeys) {
      attributeComparison[key] = products.map((p) => ({
        productId: p.id,
        value: p.attributes?.[key] ?? "—",
      }));
    }

    // Determine which product wins on price, rating, and discount percentage
    const prices = products.map((p) => p.pricing.current);
    const ratings = products.map((p) => p.ratings.average);
    const winner = {
      price: products[prices.indexOf(Math.min(...prices))]?.id ?? null,
      rating: products[ratings.indexOf(Math.max(...ratings))]?.id ?? null,
      discount:
        products.reduce(
          (best, p) =>
            p.pricing.discountPercent > (best?.pricing.discountPercent ?? -1)
              ? p
              : best,
          null as any,
        )?.id ?? null,
    };

    const cards = products.map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      brand: p.brand,
      media: p.media,
      pricing: p.pricing,
      ratings: p.ratings,
      inventory: { stock: p.inventory.stock },
      shipping: p.shipping,
      attributes: p.attributes,
      tags: p.tags,
    }));

    return { products: cards, attributeComparison, winner };
  }
}
