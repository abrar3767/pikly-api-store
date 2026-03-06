import { Module, forwardRef } from '@nestjs/common'
import { MongooseModule }     from '@nestjs/mongoose'
import { ProductsController } from './products.controller'
import { ProductsService }    from './products.service'
import { Product, ProductSchema } from '../database/product.schema'
import { CategoriesModule }       from '../categories/categories.module'

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Product.name, schema: ProductSchema }]),
    // forwardRef() breaks the circular dependency with CategoriesModule:
    // CategoriesModule also imports ProductsModule, so without forwardRef()
    // one module is undefined when the other reads it during initialization.
    forwardRef(() => CategoriesModule),
  ],
  controllers: [ProductsController],
  providers:   [ProductsService],
  exports:     [ProductsService],
})
export class ProductsModule {}
