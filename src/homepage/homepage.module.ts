import { Module }         from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { HomepageController } from './homepage.controller'
import { HomepageService }    from './homepage.service'
import { Banner, BannerSchema } from '../database/banner.schema'
import { ProductsModule }     from '../products/products.module'
import { CategoriesModule }   from '../categories/categories.module'

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Banner.name, schema: BannerSchema }]),
    ProductsModule,
    CategoriesModule,
  ],
  controllers: [HomepageController],
  providers:   [HomepageService],
  exports:     [HomepageService],  // exported so AdminModule can inject it
})
export class HomepageModule {}
