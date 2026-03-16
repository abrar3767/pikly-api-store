import { Module, forwardRef } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { ProductsController } from './products.controller'
import { ProductsService } from './products.service'
import { Product, ProductSchema } from '../database/product.schema'
import { CategoriesModule } from '../categories/categories.module'
import { AlgoliaModule } from '../algolia/algolia.module'

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Product.name, schema: ProductSchema }]),
    forwardRef(() => CategoriesModule),
    AlgoliaModule,
  ],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}