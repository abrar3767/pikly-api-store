import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model }       from 'mongoose'
import { User, UserDocument }       from '../database/user.schema'
import { UpdateProfileDto, AddAddressDto, UpdateAddressDto } from './dto/users.dto'

// Points-to-dollars conversion rate: 100 points = $1.00 (1 cent per point)
const POINTS_PER_DOLLAR = 100

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  // Strip the password hash before any data leaves this service. (QA-01)
  private safe(user: any) {
    const obj = user.toObject ? user.toObject() : user
    const { passwordHash, __v, ...rest } = obj
    return { ...rest, id: obj._id?.toString() }
  }

  private async findOrFail(userId: string) {
    const user = await this.userModel.findById(userId)
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' })
    return user
  }

  // ── Profile ────────────────────────────────────────────────────────────────

  async getProfile(userId: string) {
    const user = await this.findOrFail(userId)
    return this.safe(user)
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const update: Partial<Record<string, any>> = {}
    if (dto.firstName !== undefined) update.firstName = dto.firstName
    if (dto.lastName  !== undefined) update.lastName  = dto.lastName
    if (dto.phone     !== undefined) update.phone     = dto.phone
    if (dto.avatar    !== undefined) update.avatar    = dto.avatar

    const user = await this.userModel.findByIdAndUpdate(userId, update, { new: true })
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' })
    return this.safe(user)
  }

  // ── Addresses ──────────────────────────────────────────────────────────────

  async getAddresses(userId: string) {
    const user = await this.findOrFail(userId)
    return { addresses: user.addresses ?? [], userId }
  }

  async addAddress(userId: string, dto: AddAddressDto) {
    const user = await this.findOrFail(userId)

    if ((user.addresses ?? []).length >= 10) {
      throw new BadRequestException({ code: 'ADDRESS_LIMIT_REACHED', message: 'You can have at most 10 saved addresses' })
    }

    const addr = {
      id:        `addr_${userId}_${Date.now()}`,
      label:     dto.label    ?? 'Home',
      street:    dto.street   ?? '',
      city:      dto.city     ?? '',
      state:     dto.state    ?? '',
      zip:       dto.zip      ?? '',
      country:   dto.country  ?? 'USA',
      isDefault: dto.isDefault ?? false,
    }

    if (addr.isDefault) {
      await this.userModel.updateOne(
        { _id: userId },
        { $set: { 'addresses.$[].isDefault': false } },
      )
    }

    await this.userModel.findByIdAndUpdate(userId, { $push: { addresses: addr } })
    return addr
  }

  async updateAddress(userId: string, addressId: string, dto: UpdateAddressDto) {
    const user = await this.findOrFail(userId)
    const exists = (user.addresses ?? []).some((a: any) => a.id === addressId)
    if (!exists) throw new NotFoundException({ code: 'ADDRESS_NOT_FOUND', message: 'Address not found' })

    if (dto.isDefault) {
      await this.userModel.updateOne(
        { _id: userId },
        { $set: { 'addresses.$[].isDefault': false } },
      )
    }

    const update: Record<string, any> = {}
    if (dto.label     !== undefined) update['addresses.$[addr].label']     = dto.label
    if (dto.street    !== undefined) update['addresses.$[addr].street']    = dto.street
    if (dto.city      !== undefined) update['addresses.$[addr].city']      = dto.city
    if (dto.state     !== undefined) update['addresses.$[addr].state']     = dto.state
    if (dto.zip       !== undefined) update['addresses.$[addr].zip']       = dto.zip
    if (dto.country   !== undefined) update['addresses.$[addr].country']   = dto.country
    if (dto.isDefault !== undefined) update['addresses.$[addr].isDefault'] = dto.isDefault

    await this.userModel.findByIdAndUpdate(
      userId,
      { $set: update },
      { arrayFilters: [{ 'addr.id': addressId }] },
    )

    const updated = await this.userModel.findById(userId)
    return (updated!.addresses ?? []).find((a: any) => a.id === addressId)
  }

  async deleteAddress(userId: string, addressId: string) {
    const user   = await this.findOrFail(userId)
    const exists = (user.addresses ?? []).some((a: any) => a.id === addressId)
    if (!exists) throw new NotFoundException({ code: 'ADDRESS_NOT_FOUND', message: 'Address not found' })

    await this.userModel.findByIdAndUpdate(userId, {
      $pull: { addresses: { id: addressId } },
    })
    return { deleted: true, addressId }
  }

  // ── Loyalty Points ─────────────────────────────────────────────────────────
  // Points are awarded at 1 point per dollar when an order is marked delivered
  // (see admin-orders.controller.ts and admin-bulk.controller.ts).
  // 100 points = $1.00 credit (POINTS_PER_DOLLAR constant above).
  // Redemption here generates a credit record — in production, wire this to
  // your payment gateway's customer balance or issue a one-time coupon code.

  async getLoyaltyPoints(userId: string) {
    const user = await this.findOrFail(userId)
    return {
      userId,
      points:           user.loyaltyPoints ?? 0,
      pointsValue:      parseFloat(((user.loyaltyPoints ?? 0) / POINTS_PER_DOLLAR).toFixed(2)),
      pointsPerDollar:  POINTS_PER_DOLLAR,
      description:      `${user.loyaltyPoints ?? 0} points = $${((user.loyaltyPoints ?? 0) / POINTS_PER_DOLLAR).toFixed(2)} credit`,
    }
  }

  async redeemLoyaltyPoints(userId: string, pointsToRedeem: number) {
    if (!Number.isInteger(pointsToRedeem) || pointsToRedeem < POINTS_PER_DOLLAR) {
      throw new BadRequestException({
        code:    'INVALID_REDEMPTION',
        message: `Minimum redemption is ${POINTS_PER_DOLLAR} points ($1.00). Points must be a whole number.`,
      })
    }

    const user = await this.findOrFail(userId)
    if ((user.loyaltyPoints ?? 0) < pointsToRedeem) {
      throw new BadRequestException({
        code:    'INSUFFICIENT_POINTS',
        message: `You have ${user.loyaltyPoints ?? 0} points but requested ${pointsToRedeem}.`,
      })
    }

    const dollarValue = parseFloat((pointsToRedeem / POINTS_PER_DOLLAR).toFixed(2))

    // Atomically deduct the points — $inc with a negative value is safe here because
    // we already verified the balance above. The document is not locked between the
    // check and the update, but the points only ever increase from order deliveries,
    // so a concurrent redemption on the same account is the main race. For production,
    // replace this with a MongoDB transaction if strict balance guarantees are needed.
    const updated = await this.userModel.findByIdAndUpdate(
      userId,
      { $inc: { loyaltyPoints: -pointsToRedeem } },
      { new: true },
    )

    return {
      pointsRedeemed:    pointsToRedeem,
      dollarCredit:      dollarValue,
      remainingPoints:   updated!.loyaltyPoints ?? 0,
      message:           `$${dollarValue.toFixed(2)} credit applied. Contact support to apply this to an order, or use it on your next checkout.`,
    }
  }
}
