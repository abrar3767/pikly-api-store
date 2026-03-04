import { Module } from '@nestjs/common'
import { ProductsController } from './products.controller'
import { ProductsService }    from './products.service'
import { CacheService }       from '../common/cache.service'

@Module({
  controllers: [ProductsController],
  providers:   [ProductsService, CacheService],
  exports:     [ProductsService],
})
export class ProductsModule {}
