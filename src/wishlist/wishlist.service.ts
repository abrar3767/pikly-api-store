import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { User, UserDocument } from "../database/user.schema";
import { ProductsService } from "../products/products.service";

// WishlistService no longer reads products.json itself. It reads from
// ProductsService.products — the in-memory array that is already loaded from
// MongoDB by ProductsService.onModuleInit. The wishlist itself is still stored
// as an array of product IDs inside the User document, unchanged.

@Injectable()
export class WishlistService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly productsService: ProductsService,
  ) {}

  async getWishlist(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user)
      throw new NotFoundException({
        code: "USER_NOT_FOUND",
        message: "User not found",
      });

    const ids = user.wishlist ?? [];
    const products = ids
      .map((id: string) =>
        this.productsService.products.find((p) => p.id === id && p.isActive),
      )
      .filter(Boolean)
      .map((p: any) => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
        brand: p.brand,
        media: p.media,
        pricing: p.pricing,
        ratings: p.ratings,
        onSale: p.onSale,
        inventory: { stock: p.inventory.stock },
      }));

    return { products, count: products.length, userId };
  }

  async toggle(userId: string, productId: string) {
    const product = this.productsService.products.find(
      (p) => p.id === productId,
    );
    if (!product)
      throw new NotFoundException({
        code: "PRODUCT_NOT_FOUND",
        message: "Product not found",
      });

    const user = await this.userModel.findById(userId);
    if (!user)
      throw new NotFoundException({
        code: "USER_NOT_FOUND",
        message: "User not found",
      });

    const wishlist = user.wishlist ?? [];
    const inList = wishlist.includes(productId);
    const updated = inList
      ? wishlist.filter((id: string) => id !== productId)
      : [...wishlist, productId];

    await this.userModel.findByIdAndUpdate(userId, { wishlist: updated });
    return {
      action: inList ? "removed" : "added",
      productId,
      count: updated.length,
    };
  }

  async check(userId: string, productId: string) {
    const user = await this.userModel.findById(userId);
    if (!user)
      throw new NotFoundException({
        code: "USER_NOT_FOUND",
        message: "User not found",
      });

    const wishlist = user.wishlist ?? [];
    const inWishlist = wishlist.includes(productId);
    return { productId, userId, inWishlist, count: wishlist.length };
  }
}
