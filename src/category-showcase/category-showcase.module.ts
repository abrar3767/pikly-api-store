import { Module } from '@nestjs/common'
import { CategoryShowcaseController } from './category-showcase.controller'
import { CategoryShowcaseService }    from './category-showcase.service'

@Module({
  controllers: [CategoryShowcaseController],
  providers:   [CategoryShowcaseService],
})
export class CategoryShowcaseModule {}
