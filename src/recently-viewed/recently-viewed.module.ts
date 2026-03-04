import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { RecentlyViewedController } from "./recently-viewed.controller";
import { RecentlyViewedService } from "./recently-viewed.service";
import { User, UserSchema } from "../database/user.schema";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  controllers: [RecentlyViewedController],
  providers: [RecentlyViewedService],
})
export class RecentlyViewedModule {}
