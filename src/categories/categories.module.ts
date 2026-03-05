import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { CategoriesController } from "./categories.controller";
import { CategoriesService } from "./categories.service";
import { CacheService } from "../common/cache.service";
import { ProductsModule } from "../products/products.module";
import { Category, CategorySchema } from "../database/category.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Category.name, schema: CategorySchema },
    ]),
    ProductsModule,
  ],
  controllers: [CategoriesController],
  providers: [CategoriesService, CacheService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
