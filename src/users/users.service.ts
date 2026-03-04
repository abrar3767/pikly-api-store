import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { User, UserDocument } from "../database/user.schema";

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  private async findUser(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user)
      throw new NotFoundException({
        code: "USER_NOT_FOUND",
        message: "User not found",
      });
    return user;
  }

  private safe(user: any) {
    const obj = user.toObject ? user.toObject() : user;
    const { passwordHash, ...rest } = obj;
    return { ...rest, id: obj._id?.toString() };
  }

  async getProfile(userId: string) {
    const user = await this.findUser(userId);
    return this.safe(user);
  }

  async updateProfile(userId: string, body: any) {
    const allowed = ["firstName", "lastName", "phone", "avatar"];
    const update: any = {};
    for (const key of allowed) {
      if (body[key] !== undefined) update[key] = body[key];
    }
    const user = await this.userModel.findByIdAndUpdate(userId, update, {
      new: true,
    });
    if (!user)
      throw new NotFoundException({
        code: "USER_NOT_FOUND",
        message: "User not found",
      });
    return this.safe(user);
  }

  async getAddresses(userId: string) {
    const user = await this.findUser(userId);
    return { addresses: user.addresses ?? [], userId };
  }

  async addAddress(userId: string, body: any) {
    const user = await this.findUser(userId);
    const addr = {
      id: `addr_${userId}_${Date.now()}`,
      label: body.label ?? "Home",
      street: body.street,
      city: body.city,
      state: body.state,
      zip: body.zip,
      country: body.country ?? "USA",
      isDefault: body.isDefault ?? false,
    };
    const addresses = user.addresses ?? [];
    if (addr.isDefault) addresses.forEach((a: any) => (a.isDefault = false));
    addresses.push(addr);
    await this.userModel.findByIdAndUpdate(userId, { addresses });
    return addr;
  }

  async updateAddress(userId: string, addressId: string, body: any) {
    const user = await this.findUser(userId);
    const addresses = user.addresses ?? [];
    const idx = addresses.findIndex((a: any) => a.id === addressId);
    if (idx === -1)
      throw new NotFoundException({
        code: "ADDRESS_NOT_FOUND",
        message: "Address not found",
      });

    const fields = [
      "label",
      "street",
      "city",
      "state",
      "zip",
      "country",
      "isDefault",
    ];
    for (const f of fields) {
      if (body[f] !== undefined) addresses[idx][f] = body[f];
    }
    if (body.isDefault) {
      addresses.forEach((a: any) => {
        if (a.id !== addressId) a.isDefault = false;
      });
    }
    await this.userModel.findByIdAndUpdate(userId, { addresses });
    return addresses[idx];
  }

  async deleteAddress(userId: string, addressId: string) {
    const user = await this.findUser(userId);
    const before = (user.addresses ?? []).length;
    const updated = (user.addresses ?? []).filter(
      (a: any) => a.id !== addressId,
    );
    if (updated.length === before)
      throw new NotFoundException({
        code: "ADDRESS_NOT_FOUND",
        message: "Address not found",
      });
    await this.userModel.findByIdAndUpdate(userId, { addresses: updated });
    return { deleted: true, addressId };
  }
}
