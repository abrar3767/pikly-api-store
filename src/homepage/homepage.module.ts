import { Module } from '@nestjs/common'
import { HomepageController } from './homepage.controller'
import { HomepageService }    from './homepage.service'
import { CacheService }       from '../common/cache.service'

@Module({
  controllers: [HomepageController],
  providers:   [HomepageService, CacheService],
})
export class HomepageModule {}
