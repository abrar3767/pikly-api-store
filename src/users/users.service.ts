import { Injectable, NotFoundException } from '@nestjs/common'
import * as fs   from 'fs'
import * as path from 'path'

@Injectable()
export class UsersService {
  private users: any[] = []

  constructor() { this.load() }

  private load() {
    try {
      this.users = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'users.json'), 'utf-8'))
    } catch { this.users = [] }
  }

  private findUser(userId: string) {
    const user = this.users.find(u => u.id === userId)
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' })
    return user
  }

  private safe(user: any) {
    const { passwordHash, ...rest } = user
    return rest
  }

  getProfile(userId: string) {
    return this.safe(this.findUser(userId))
  }

  updateProfile(userId: string, body: any) {
    const user   = this.findUser(userId)
    const allowed = ['firstName', 'lastName', 'phone', 'avatar']
    for (const key of allowed) {
      if (body[key] !== undefined) user[key] = body[key]
    }
    user.updatedAt = new Date().toISOString()
    return this.safe(user)
  }

  getAddresses(userId: string) {
    const user = this.findUser(userId)
    return { addresses: user.addresses ?? [], userId }
  }

  addAddress(userId: string, body: any) {
    const user = this.findUser(userId)
    if (!user.addresses) user.addresses = []
    const addr = {
      id:        `addr_${userId}_${Date.now()}`,
      label:     body.label     ?? 'Home',
      street:    body.street,
      city:      body.city,
      state:     body.state,
      zip:       body.zip,
      country:   body.country   ?? 'USA',
      isDefault: body.isDefault ?? false,
    }
    if (addr.isDefault) {
      user.addresses.forEach((a: any) => (a.isDefault = false))
    }
    user.addresses.push(addr)
    return addr
  }

  updateAddress(userId: string, addressId: string, body: any) {
    const user = this.findUser(userId)
    const addr = user.addresses?.find((a: any) => a.id === addressId)
    if (!addr) throw new NotFoundException({ code: 'ADDRESS_NOT_FOUND', message: 'Address not found' })
    const fields = ['label','street','city','state','zip','country','isDefault']
    for (const f of fields) {
      if (body[f] !== undefined) addr[f] = body[f]
    }
    if (body.isDefault) {
      user.addresses.forEach((a: any) => { if (a.id !== addressId) a.isDefault = false })
    }
    return addr
  }

  deleteAddress(userId: string, addressId: string) {
    const user = this.findUser(userId)
    const before = (user.addresses ?? []).length
    user.addresses = (user.addresses ?? []).filter((a: any) => a.id !== addressId)
    if (user.addresses.length === before) throw new NotFoundException({ code: 'ADDRESS_NOT_FOUND', message: 'Address not found' })
    return { deleted: true, addressId }
  }
}
