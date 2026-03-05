import { Module }         from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { RecentlyViewedController } from './recently-viewed.controller'
import { RecentlyViewedService }    from './recently-viewed.service'
import { User, UserSchema }         from '../database/user.schema'
import { ProductsModule }           from '../products/products.module'

@Module({
  imports:     [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]), ProductsModule],
  controllers: [RecentlyViewedController],
  providers:   [RecentlyViewedService],
})
export class RecentlyViewedModule {}
