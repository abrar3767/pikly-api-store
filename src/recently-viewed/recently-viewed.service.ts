import { Injectable } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import { smartPaginate } from "../common/api-utils";

const MAX_ITEMS = 20;

@Injectable()
export class RecentlyViewedService {
  // userId → ordered array of productIds (most recent first)
  private store = new Map<string, string[]>();
  private products: any[] = [];

  constructor() {
    try {
      this.products = JSON.parse(
        fs.readFileSync(
          path.join(process.cwd(), "data", "products.json"),
          "utf-8",
        ),
      );
    } catch {
      this.products = [];
    }
  }

  track(userId: string, productId: string) {
    let list = this.store.get(userId) ?? [];
    list = list.filter((id) => id !== productId); // remove duplicate
    list.unshift(productId); // add to front
    if (list.length > MAX_ITEMS) list = list.slice(0, MAX_ITEMS);
    this.store.set(userId, list);
    return { tracked: true, productId, userId };
  }

  // ── GET /recently-viewed — supports offset (page) and cursor pagination ────
  getRecent(
    userId: string,
    query: { page?: number; limit?: number; cursor?: string },
  ) {
    const { page, limit = 10, cursor } = query;

    const ids = this.store.get(userId) ?? [];

    // Map ids to product objects
    const items = ids
      .map((id) => this.products.find((p) => p.id === id && p.isActive))
      .filter(Boolean)
      .map((p) => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
        brand: p.brand,
        media: p.media,
        pricing: p.pricing,
        ratings: p.ratings,
      }));

    // smartPaginate — offset or cursor based on what's passed
    const paginated = smartPaginate(items, { page, limit, cursor });

    return {
      products: paginated.items,
      userId,
      totalViewed: items.length,
      limit: paginated.limit,
      hasNextPage: paginated.hasNextPage,
      hasPrevPage: paginated.hasPrevPage,
      mode: paginated.mode,
      // offset mode fields
      ...(paginated.mode === "offset" && {
        page: (paginated as any).page,
        totalPages: (paginated as any).totalPages,
      }),
      // cursor mode fields
      ...(paginated.mode === "cursor" && {
        nextCursor: (paginated as any).nextCursor,
        prevCursor: (paginated as any).prevCursor,
      }),
    };
  }
}
