import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { CategoriesController } from "./categories.controller";
import { CategoriesService } from "./categories.service";
import { Category, CategorySchema } from "../database/category.schema";
import { ProductsModule } from "../products/products.module";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Category.name, schema: CategorySchema },
    ]),
    ProductsModule,
  ],
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
