/**
 * facet-config.ts
 *
 * Single source of truth for every facet dimension.
 * ALL facet counts come from Algolia — zero JS computed counts.
 *
 * AMAZON FACETING MODEL:
 *
 *  ┌─ User searches "laptop" ───────────────────────────────────────────┐
 *  │  Algolia returns:                                                   │
 *  │  • 2,340 matching hits                                              │
 *  │  • brand counts  → Dell(420) HP(380) Lenovo(290) ...               │
 *  │  • price range   → $89 – $3,499  (only laptops, not 50k items)     │
 *  │  • rating dist   → 4★+(1,890)  3★+(2,100) ...                      │
 *  │  • inStock count → 2,100 (not global 45,000)                       │
 *  │  • attrValues    → ram:16GB(890) ram:32GB(450) storage:512GB(780)  │
 *  └─────────────────────────────────────────────────────────────────────┘
 *
 *  DISJUNCTIVE FACETING:
 *  User selects Brand=Dell → sidebar still shows HP(380), Lenovo(290)
 *  so they can ADD more brands. Without disjunctive, HP would show 0.
 *
 *  This requires one extra Algolia query per active disjunctive filter,
 *  each run WITHOUT that filter so its counts stay "open" (OR within
 *  dimension, AND between dimensions).
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type FacetType = 'disjunctive' | 'conjunctive' | 'boolean' | 'range' | 'hierarchical'

export interface FacetDimension {
  queryKey:    string       // key in FilterProductsDto  e.g. "brand"
  algoliaAttr: string       // Algolia attribute name     e.g. "brand"
  type:        FacetType
  label:       string       // UI display label
  disjunctive: boolean      // needs separate Algolia query for correct counts
  maxValues:   number       // how many values Algolia returns
  searchable:  boolean      // show search box inside this facet panel
  sortBy:      'count' | 'alpha'
}

// ─── Facet dimension registry ─────────────────────────────────────────────────
// Ordered as they should appear in the sidebar.

export const FACET_DIMENSIONS: FacetDimension[] = [
  // ── Hierarchical category navigation ────────────────────────────────────────
  {
    queryKey: 'category', algoliaAttr: 'category',
    type: 'hierarchical', label: 'Category',
    disjunctive: false, maxValues: 50, searchable: false, sortBy: 'count',
  },
  {
    queryKey: 'subcategory', algoliaAttr: 'subcategory',
    type: 'conjunctive', label: 'Subcategory',
    disjunctive: false, maxValues: 50, searchable: false, sortBy: 'count',
  },

  // ── Brand — disjunctive (multi-select OR) ────────────────────────────────────
  {
    queryKey: 'brand', algoliaAttr: 'brand',
    type: 'disjunctive', label: 'Brand',
    disjunctive: true, maxValues: 100, searchable: true, sortBy: 'count',
  },

  // ── Price range — handled as numericFilters ───────────────────────────────────
  {
    queryKey: 'price', algoliaAttr: 'price',
    type: 'range', label: 'Price',
    disjunctive: false, maxValues: 0, searchable: false, sortBy: 'count',
  },

  // ── Rating — conjunctive range (≥ value) ─────────────────────────────────────
  {
    queryKey: 'rating', algoliaAttr: 'avgRating',
    type: 'range', label: 'Customer Rating',
    disjunctive: false, maxValues: 0, searchable: false, sortBy: 'count',
  },

  // ── Discount — conjunctive range (≥ value) ───────────────────────────────────
  {
    queryKey: 'discount', algoliaAttr: 'discountPercent',
    type: 'range', label: 'Discount',
    disjunctive: false, maxValues: 0, searchable: false, sortBy: 'count',
  },

  // ── Colors — disjunctive multi-select ────────────────────────────────────────
  {
    queryKey: 'color', algoliaAttr: 'colors',
    type: 'disjunctive', label: 'Color',
    disjunctive: true, maxValues: 50, searchable: false, sortBy: 'count',
  },

  // ── Sizes — disjunctive multi-select ─────────────────────────────────────────
  {
    queryKey: 'size', algoliaAttr: 'sizes',
    type: 'disjunctive', label: 'Size',
    disjunctive: true, maxValues: 50, searchable: false, sortBy: 'count',
  },

  // ── Condition — conjunctive single select ────────────────────────────────────
  {
    queryKey: 'condition', algoliaAttr: 'condition',
    type: 'conjunctive', label: 'Condition',
    disjunctive: false, maxValues: 10, searchable: false, sortBy: 'count',
  },

  // ── Warehouse — disjunctive ──────────────────────────────────────────────────
  {
    queryKey: 'warehouse', algoliaAttr: 'warehouse',
    type: 'disjunctive', label: 'Ships From',
    disjunctive: true, maxValues: 20, searchable: false, sortBy: 'count',
  },

  // ── Availability booleans ────────────────────────────────────────────────────
  {
    queryKey: 'inStock', algoliaAttr: 'inStock',
    type: 'boolean', label: 'In Stock',
    disjunctive: false, maxValues: 2, searchable: false, sortBy: 'count',
  },
  {
    queryKey: 'isPrime', algoliaAttr: 'isPrime',
    type: 'boolean', label: 'Prime Eligible',
    disjunctive: false, maxValues: 2, searchable: false, sortBy: 'count',
  },
  {
    queryKey: 'freeShipping', algoliaAttr: 'freeShipping',
    type: 'boolean', label: 'Free Shipping',
    disjunctive: false, maxValues: 2, searchable: false, sortBy: 'count',
  },
  {
    queryKey: 'expressAvailable', algoliaAttr: 'expressAvailable',
    type: 'boolean', label: 'Express Delivery',
    disjunctive: false, maxValues: 2, searchable: false, sortBy: 'count',
  },

  // ── Badge booleans ───────────────────────────────────────────────────────────
  {
    queryKey: 'onSale', algoliaAttr: 'onSale',
    type: 'boolean', label: 'On Sale',
    disjunctive: false, maxValues: 2, searchable: false, sortBy: 'count',
  },
  {
    queryKey: 'bestSeller', algoliaAttr: 'bestSeller',
    type: 'boolean', label: "Best Seller",
    disjunctive: false, maxValues: 2, searchable: false, sortBy: 'count',
  },
  {
    queryKey: 'featured', algoliaAttr: 'featured',
    type: 'boolean', label: 'Featured',
    disjunctive: false, maxValues: 2, searchable: false, sortBy: 'count',
  },
  {
    queryKey: 'newArrival', algoliaAttr: 'newArrival',
    type: 'boolean', label: 'New Arrival',
    disjunctive: false, maxValues: 2, searchable: false, sortBy: 'count',
  },
  {
    queryKey: 'topRated', algoliaAttr: 'topRated',
    type: 'boolean', label: 'Top Rated',
    disjunctive: false, maxValues: 2, searchable: false, sortBy: 'count',
  },
  {
    queryKey: 'trending', algoliaAttr: 'trending',
    type: 'boolean', label: 'Trending',
    disjunctive: false, maxValues: 2, searchable: false, sortBy: 'count',
  },

  // ── Dynamic product attributes — THE KEY TO AMAZON-STYLE CATEGORY FACETS ─────
  // attrValues contains "ram:16GB", "storage:512GB", "screenSize:15.6\"" etc.
  // Algolia groups these by prefix — frontend splits them to show per-key panels.
  // When user filters attrs=ram:16GB,storage:512GB both are ANDed together.
  {
    queryKey: 'attrs', algoliaAttr: 'attrValues',
    type: 'disjunctive', label: 'Specifications',
    disjunctive: true, maxValues: 500, searchable: false, sortBy: 'count',
  },
]

// ─── Quick lookup helpers ──────────────────────────────────────────────────────

export const DISJUNCTIVE_DIMENSIONS = FACET_DIMENSIONS.filter((d) => d.disjunctive)

export const ALL_ALGOLIA_FACET_ATTRS = FACET_DIMENSIONS
  .filter((d) => d.type !== 'range')
  .map((d) => d.algoliaAttr)

// ── Attributes to register in Algolia index settings ──────────────────────────
export const ALGOLIA_FACET_SETTINGS = [
  // Searchable facets (shown in UI with counts + search box)
  'searchable(brand)',
  'searchable(category)',
  'searchable(subcategory)',
  'searchable(colors)',
  'searchable(sizes)',
  'searchable(condition)',
  'searchable(warehouse)',
  // Dynamic attribute facets — THE most important one for Amazon-style filtering
  // attrValues stores ["ram:16GB","storage:512GB","os:Windows 11"] per product
  // This single field powers ALL category-specific spec filters
  'attrValues',
  // Boolean facets — all query-aware counts
  'inStock',
  'isPrime',
  'freeShipping',
  'expressAvailable',
  'onSale',
  'bestSeller',
  'featured',
  'newArrival',
  'topRated',
  'trending',
]

// ── Numeric attributes for Algolia facet stats (gives min/max per result set) ──
// These power the price slider and rating filter ranges
export const ALGOLIA_NUMERIC_ATTRS = [
  'price',
  'avgRating',
  'discountPercent',
  'createdAtMs',
  'soldCount',
]

// ── Sort replica index map ─────────────────────────────────────────────────────
export const SORT_INDEX_MAP: Record<string, string> = {
  price_asc:     '_price_asc',
  price_desc:    '_price_desc',
  rating_desc:   '_rating_desc',
  newest:        '_newest',
  bestselling:   '_bestselling',
  discount_desc: '_discount_desc',
}
