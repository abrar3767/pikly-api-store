import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model }       from 'mongoose'
import { User, UserDocument }       from '../database/user.schema'
import { UpdateProfileDto, AddAddressDto, UpdateAddressDto } from './dto/users.dto'

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  // Strip the password hash before any data leaves this service.
  private safe(user: any) {
    const obj = user.toObject ? user.toObject() : user
    const { passwordHash, ...rest } = obj
    return { ...rest, id: obj._id?.toString() }
  }

  private async findOrFail(userId: string) {
    const user = await this.userModel.findById(userId)
    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' })
    }
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
    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' })
    }
    return this.safe(user)
  }

  // ── Addresses ──────────────────────────────────────────────────────────────
  // All mutations use MongoDB array operators ($push, $pull, $set with positional
  // operator) instead of the old read-modify-write pattern, which was vulnerable
  // to a race condition where two concurrent requests could silently overwrite
  // each other's changes.

  async getAddresses(userId: string) {
    const user = await this.findOrFail(userId)
    return { addresses: user.addresses ?? [], userId }
  }

  async addAddress(userId: string, dto: AddAddressDto) {
    const user = await this.findOrFail(userId)

    // Cap the total number of addresses to prevent unbounded array growth.
    if ((user.addresses ?? []).length >= 10) {
      throw new BadRequestException({
        code:    'ADDRESS_LIMIT_REACHED',
        message: 'You can have at most 10 saved addresses',
      })
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
      // Atomically unset all existing defaults before adding the new one.
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
    const addresses = user.addresses ?? []
    const exists = addresses.some((a: any) => a.id === addressId)
    if (!exists) {
      throw new NotFoundException({ code: 'ADDRESS_NOT_FOUND', message: 'Address not found' })
    }

    // Use MongoDB arrayFilters with an identifier so the update targets the
    // specific element by its `id` field — not by array index. The previous
    // implementation used findIndex() then `addresses.${idx}.field`, which
    // is vulnerable to a race condition: if a concurrent request adds or
    // removes an address between the read and the write, the wrong element
    // gets updated. ArrayFilters are evaluated atomically by MongoDB.
    if (dto.isDefault === true) {
      // First atomically clear all defaults, then set the target one.
      await this.userModel.updateOne(
        { _id: userId },
        { $set: { 'addresses.$[].isDefault': false } },
      )
    }

    const setFields: Record<string, any> = {}
    const fields = ['label', 'street', 'city', 'state', 'zip', 'country', 'isDefault'] as const
    for (const f of fields) {
      if (dto[f] !== undefined) setFields[`addresses.$[addr].${f}`] = dto[f]
    }

    await this.userModel.findByIdAndUpdate(
      userId,
      { $set: setFields },
      { arrayFilters: [{ 'addr.id': addressId }] },
    )

    // Re-read and return the updated address by its stable id, not index.
    const updated = await this.userModel.findById(userId)
    return (updated?.addresses ?? []).find((a: any) => a.id === addressId) ?? null
  }

  async deleteAddress(userId: string, addressId: string) {
    const user = await this.findOrFail(userId)
    const exists = (user.addresses ?? []).some((a: any) => a.id === addressId)
    if (!exists) {
      throw new NotFoundException({ code: 'ADDRESS_NOT_FOUND', message: 'Address not found' })
    }

    // $pull atomically removes all array elements matching the condition.
    await this.userModel.findByIdAndUpdate(
      userId,
      { $pull: { addresses: { id: addressId } } },
    )
    return { deleted: true, addressId }
  }
}
