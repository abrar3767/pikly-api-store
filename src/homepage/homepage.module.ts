import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { HomepageController } from "./homepage.controller";
import { HomepageService } from "./homepage.service";
import { CacheService } from "../common/cache.service";
import { ProductsModule } from "../products/products.module";
import { CategoriesModule } from "../categories/categories.module";
import { Banner, BannerSchema } from "../database/banner.schema";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Banner.name, schema: BannerSchema }]),
    ProductsModule,
    CategoriesModule,
  ],
  controllers: [HomepageController],
  providers: [HomepageService, CacheService],
  exports: [HomepageService],
})
export class HomepageModule {}
