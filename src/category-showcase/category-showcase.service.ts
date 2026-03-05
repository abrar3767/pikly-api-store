import { Injectable } from "@nestjs/common";
import { ProductsService } from "../products/products.service";
import { CategoriesService } from "../categories/categories.service";
import { CategoryShowcaseDto } from "./dto/category-showcase.dto";
import { smartPaginate } from "../common/api-utils";

// CategoryShowcaseService previously loaded both products.json and categories.json
// in its constructor. It now reads from the shared in-memory arrays on
// ProductsService and CategoriesService — the last two fs.readFileSync calls in
// the entire codebase beyond health checks. All logic is unchanged.

@Injectable()
export class CategoryShowcaseService {
  constructor(
    private readonly productsService: ProductsService,
    private readonly categoriesService: CategoriesService,
  ) {}

  getShowcase(dto: CategoryShowcaseDto) {
    const {
      page = 1,
      limit = 6,
      productsLimit = 4,
      category,
      onlyFeatured = false,
      sort = "productCount",
      cursor,
    } = dto;

    const products = this.productsService.products;
    const categories = this.categoriesService.categories;

    // Build a map keyed by top-level category slug, accumulating products per category
    const categoryMap = new Map<
      string,
      {
        categoryName: string;
        categorySlug: string;
        featured: boolean;
        products: any[];
      }
    >();

    for (const product of products) {
      if (!product.isActive) continue;
      const key = product.category as string;
      if (!categoryMap.has(key)) {
        const catMeta = categories.find(
          (c: any) =>
            c.slug === key || c.name?.toLowerCase() === key?.toLowerCase(),
        );
        categoryMap.set(key, {
          categoryName: catMeta?.name ?? this.capitalize(key),
          categorySlug: key,
          featured: catMeta?.featured ?? false,
          products: [],
        });
      }
      categoryMap.get(key)!.products.push(product);
    }

    let cats = Array.from(categoryMap.values());

    if (category)
      cats = cats.filter(
        (c) => c.categorySlug.toLowerCase() === category.toLowerCase(),
      );
    if (onlyFeatured) cats = cats.filter((c) => c.featured);

    if (sort === "alphabetical") {
      cats.sort((a, b) => a.categoryName.localeCompare(b.categoryName));
    } else {
      cats.sort((a, b) => b.products.length - a.products.length);
    }

    const paginated = smartPaginate(cats, {
      page: cursor ? undefined : (page ?? 1),
      limit: limit ?? 6,
      cursor: cursor ?? undefined,
    });

    const result = paginated.items.map((cat: any) => ({
      categoryName: cat.categoryName,
      categorySlug: cat.categorySlug,
      totalProducts: cat.products.length,
      products: cat.products.slice(0, productsLimit).map((p: any) => ({
        title: p.title,
        slug: p.slug,
        image: p.media?.small ?? p.media?.thumb ?? null,
      })),
    }));

    return {
      categories: result,
      pagination: {
        total: paginated.total,
        limit: paginated.limit,
        hasNextPage: paginated.hasNextPage,
        hasPrevPage: paginated.hasPrevPage,
        mode: paginated.mode,
        ...(paginated.mode === "offset" && {
          page: (paginated as any).page,
          totalPages: (paginated as any).totalPages,
        }),
        ...(paginated.mode === "cursor" && {
          nextCursor: (paginated as any).nextCursor,
          prevCursor: (paginated as any).prevCursor,
        }),
      },
    };
  }

  private capitalize(str: string): string {
    return str
      ? str.charAt(0).toUpperCase() + str.slice(1).replace(/-/g, " ")
      : str;
  }
}
