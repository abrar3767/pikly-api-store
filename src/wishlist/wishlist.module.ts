import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { WishlistController } from "./wishlist.controller";
import { WishlistService } from "./wishlist.service";
import { User, UserSchema } from "../database/user.schema";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  controllers: [WishlistController],
  providers: [WishlistService],
})
export class WishlistModule {}
