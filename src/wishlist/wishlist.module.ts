import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { WishlistController } from './wishlist.controller'
import { WishlistService } from './wishlist.service'
import { User, UserSchema } from '../database/user.schema'
import { ProductsModule } from '../products/products.module'

@Module({
  imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]), ProductsModule],
  controllers: [WishlistController],
  providers: [WishlistService],
})
export class WishlistModule {}
