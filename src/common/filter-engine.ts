import Fuse from "fuse.js";
import { smartPaginate } from "./api-utils";

export interface FilterQuery {
  q?: string;
  category?: string;
  subcategory?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  rating?: number;
  inStock?: boolean;
  freeShipping?: boolean;
  featured?: boolean;
  bestSeller?: boolean;
  newArrival?: boolean;
  trending?: boolean;
  topRated?: boolean;
  onSale?: boolean;
  attrs?: string;
  sort?: string;
  page?: number;
  limit?: number;
  cursor?: string; // ← cursor pagination support
  includeFacets?: boolean;
}

function parseBool(val: any): boolean | null {
  if (val === true || val === "true" || val === "1") return true;
  if (val === false || val === "false" || val === "0") return false;
  return null;
}

export function filterProducts(products: any[], query: FilterQuery) {
  const startTime = Date.now();
  let result = [...products];

  // ── 1. Fuzzy search ────────────────────────────────────────────────────────
  if (query.q && query.q.trim()) {
    const fuse = new Fuse(result, {
      keys: ["title", "brand", "description", "tags"],
      threshold: 0.3,
      includeScore: true,
    });
    const searched = fuse.search(query.q.trim());
    result = searched.map((r) => ({ ...r.item, _score: r.score }));
  }

  // ── 2. Category filters ────────────────────────────────────────────────────
  if (query.category)
    result = result.filter((p) => p.category === query.category);
  if (query.subcategory)
    result = result.filter((p) => p.subcategory === query.subcategory);

  // ── 3. Brand (multi-value comma separated) ─────────────────────────────────
  if (query.brand) {
    const brands = query.brand.split(",").map((b) => b.trim().toLowerCase());
    result = result.filter((p) => brands.includes(p.brand.toLowerCase()));
  }

  // ── 4. Price range ─────────────────────────────────────────────────────────
  if (query.minPrice !== undefined && query.minPrice !== null) {
    result = result.filter((p) => p.pricing.current >= Number(query.minPrice));
  }
  if (query.maxPrice !== undefined && query.maxPrice !== null) {
    result = result.filter((p) => p.pricing.current <= Number(query.maxPrice));
  }

  // ── 5. Rating minimum ──────────────────────────────────────────────────────
  if (query.rating) {
    result = result.filter((p) => p.ratings.average >= Number(query.rating));
  }

  // ── 6. Boolean flags ───────────────────────────────────────────────────────
  const boolFlags: (keyof FilterQuery)[] = [
    "featured",
    "bestSeller",
    "newArrival",
    "trending",
    "topRated",
    "onSale",
  ];
  for (const flag of boolFlags) {
    const val = parseBool(query[flag]);
    if (val !== null) result = result.filter((p) => p[flag] === val);
  }

  const inStock = parseBool(query.inStock);
  if (inStock !== null) {
    result = inStock
      ? result.filter((p) => p.inventory.stock > 0)
      : result.filter((p) => p.inventory.stock === 0);
  }

  const freeShipping = parseBool(query.freeShipping);
  if (freeShipping !== null) {
    result = result.filter((p) => p.shipping.freeShipping === freeShipping);
  }

  // ── 7. Dynamic attribute filters  attrs=ram:16GB,storage:512GB ────────────
  if (query.attrs) {
    const pairs = query.attrs.split(",").map((a) => a.trim());
    for (const pair of pairs) {
      const [key, value] = pair.split(":").map((s) => s.trim());
      if (key && value) {
        result = result.filter(
          (p) =>
            p.attributes &&
            String(p.attributes[key]).toLowerCase() === value.toLowerCase(),
        );
      }
    }
  }

  // ── 8. Sort ────────────────────────────────────────────────────────────────
  const sort = query.sort || "relevance";
  switch (sort) {
    case "price_asc":
      result.sort((a, b) => a.pricing.current - b.pricing.current);
      break;
    case "price_desc":
      result.sort((a, b) => b.pricing.current - a.pricing.current);
      break;
    case "rating_desc":
      result.sort((a, b) => b.ratings.average - a.ratings.average);
      break;
    case "newest":
      result.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      break;
    case "bestselling":
      result.sort(
        (a, b) => (b.inventory?.sold ?? 0) - (a.inventory?.sold ?? 0),
      );
      break;
    case "discount_desc":
      result.sort(
        (a, b) => b.pricing.discountPercent - a.pricing.discountPercent,
      );
      break;
    case "relevance":
    default:
      if (query.q) {
        result.sort((a: any, b: any) => (a._score ?? 1) - (b._score ?? 1));
      }
      break;
  }

  // ── 9. Smart Paginate — offset OR cursor ───────────────────────────────────
  const paginated = smartPaginate(result, {
    page: query.page,
    limit: query.limit ?? 20,
    cursor: query.cursor,
  });

  // Build appliedFilters list
  const appliedFilters: any[] = [];
  if (query.q)
    appliedFilters.push({
      key: "q",
      value: query.q,
      label: `Search: ${query.q}`,
    });
  if (query.category)
    appliedFilters.push({
      key: "category",
      value: query.category,
      label: `Category: ${query.category}`,
    });
  if (query.brand) {
    query.brand
      .split(",")
      .forEach((b) =>
        appliedFilters.push({
          key: "brand",
          value: b.trim(),
          label: `Brand: ${b.trim()}`,
        }),
      );
  }
  if (query.minPrice)
    appliedFilters.push({
      key: "minPrice",
      value: query.minPrice,
      label: `Min Price: $${query.minPrice}`,
    });
  if (query.maxPrice)
    appliedFilters.push({
      key: "maxPrice",
      value: query.maxPrice,
      label: `Max Price: $${query.maxPrice}`,
    });
  if (query.rating)
    appliedFilters.push({
      key: "rating",
      value: query.rating,
      label: `Rating: ${query.rating}★+`,
    });
  if (parseBool(query.inStock) === true)
    appliedFilters.push({ key: "inStock", value: true, label: "In Stock" });
  if (parseBool(query.freeShipping) === true)
    appliedFilters.push({
      key: "freeShipping",
      value: true,
      label: "Free Shipping",
    });
  if (parseBool(query.featured) === true)
    appliedFilters.push({ key: "featured", value: true, label: "Featured" });
  if (parseBool(query.bestSeller) === true)
    appliedFilters.push({
      key: "bestSeller",
      value: true,
      label: "Best Seller",
    });
  if (parseBool(query.newArrival) === true)
    appliedFilters.push({
      key: "newArrival",
      value: true,
      label: "New Arrival",
    });
  if (parseBool(query.trending) === true)
    appliedFilters.push({ key: "trending", value: true, label: "Trending" });
  if (parseBool(query.topRated) === true)
    appliedFilters.push({ key: "topRated", value: true, label: "Top Rated" });
  if (parseBool(query.onSale) === true)
    appliedFilters.push({ key: "onSale", value: true, label: "On Sale" });
  if (query.attrs) {
    query.attrs.split(",").forEach((pair) => {
      const [k, v] = pair.split(":");
      if (k && v)
        appliedFilters.push({
          key: k.trim(),
          value: v.trim(),
          label: `${k.trim()}: ${v.trim()}`,
        });
    });
  }

  return {
    ...paginated,
    appliedFilters,
    searchMeta: {
      query: query.q || null,
      totalResults: paginated.total,
      fuzzyMatches: query.q
        ? result.filter((p: any) => p._score !== undefined).length
        : 0,
      searchTime: `${Date.now() - startTime}ms`,
      paginationMode: paginated.mode, // 'offset' or 'cursor'
    },
    sortOptions: [
      { value: "relevance", label: "Most Relevant" },
      { value: "price_asc", label: "Price: Low to High" },
      { value: "price_desc", label: "Price: High to Low" },
      { value: "rating_desc", label: "Top Rated" },
      { value: "newest", label: "Newest First" },
      { value: "bestselling", label: "Best Selling" },
      { value: "discount_desc", label: "Biggest Discount" },
    ],
  };
}
