import { Module } from '@nestjs/common'
import { RecentlyViewedController } from './recently-viewed.controller'
import { RecentlyViewedService }    from './recently-viewed.service'

@Module({
  controllers: [RecentlyViewedController],
  providers:   [RecentlyViewedService],
})
export class RecentlyViewedModule {}
