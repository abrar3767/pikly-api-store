import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import * as fs from "fs";
import * as path from "path";
import { User, UserDocument } from "../database/user.schema";
import { smartPaginate } from "../common/api-utils";

const MAX_ITEMS = 20;

@Injectable()
export class RecentlyViewedService {
  private products: any[] = [];

  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {
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

  async track(userId: string, productId: string) {
    const user = await this.userModel.findById(userId);
    if (!user)
      throw new NotFoundException({
        code: "USER_NOT_FOUND",
        message: "User not found",
      });

    let list = user.recentlyViewed ?? [];
    list = list.filter((id: string) => id !== productId); // remove duplicate
    list.unshift(productId); // add to front
    if (list.length > MAX_ITEMS) list = list.slice(0, MAX_ITEMS);

    await this.userModel.findByIdAndUpdate(userId, { recentlyViewed: list });
    return { tracked: true, productId, userId };
  }

  async getRecent(
    userId: string,
    query: { page?: number; limit?: number; cursor?: string },
  ) {
    const { page, limit = 10, cursor } = query;

    const user = await this.userModel.findById(userId);
    if (!user)
      throw new NotFoundException({
        code: "USER_NOT_FOUND",
        message: "User not found",
      });

    const ids = user.recentlyViewed ?? [];
    const items = ids
      .map((id: string) => this.products.find((p) => p.id === id && p.isActive))
      .filter(Boolean)
      .map((p: any) => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
        brand: p.brand,
        media: p.media,
        pricing: p.pricing,
        ratings: p.ratings,
      }));

    const paginated = smartPaginate(items, { page, limit, cursor });

    return {
      products: paginated.items,
      userId,
      totalViewed: items.length,
      limit: paginated.limit,
      hasNextPage: paginated.hasNextPage,
      hasPrevPage: paginated.hasPrevPage,
      mode: paginated.mode,
      ...((paginated as any).mode === "offset" && {
        page: (paginated as any).page,
        totalPages: (paginated as any).totalPages,
      }),
      ...((paginated as any).mode === "cursor" && {
        nextCursor: (paginated as any).nextCursor,
        prevCursor: (paginated as any).prevCursor,
      }),
    };
  }
}
