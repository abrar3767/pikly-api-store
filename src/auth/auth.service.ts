import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { JwtService } from "@nestjs/jwt";
import { Model } from "mongoose";
import * as bcrypt from "bcrypt";
import { User, UserDocument } from "../database/user.schema";
import { RegisterDto, LoginDto, RefreshTokenDto } from "./dto/auth.dto";

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly jwtService: JwtService,
  ) {}

  private sign(user: any) {
    const payload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
    };
    return {
      token: this.jwtService.sign(payload),
      expiresIn: "7d",
    };
  }

  async register(dto: RegisterDto) {
    const existing = await this.userModel.findOne({
      email: dto.email.toLowerCase(),
    });
    if (existing)
      throw new BadRequestException({
        code: "EMAIL_TAKEN",
        message: "An account with this email already exists",
      });

    const hash = await bcrypt.hash(dto.password, 10);
    const now = new Date().toISOString();

    const user = await this.userModel.create({
      email: dto.email.toLowerCase(),
      passwordHash: hash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      avatar: null,
      phone: null,
      role: "customer",
      addresses: [],
      wishlist: [],
      recentlyViewed: [],
      loyaltyPoints: 0,
      isVerified: true,
      isActive: true,
      lastLogin: now,
    });

    const { token, expiresIn } = this.sign(user);
    const { passwordHash, ...safeUser } = user.toObject();
    return { user: { ...safeUser, id: user._id.toString() }, token, expiresIn };
  }

  async login(dto: LoginDto) {
    const user = await this.userModel.findOne({
      email: dto.email.toLowerCase(),
    });
    if (!user)
      throw new UnauthorizedException({
        code: "INVALID_CREDENTIALS",
        message: "Invalid email or password",
      });

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid)
      throw new UnauthorizedException({
        code: "INVALID_CREDENTIALS",
        message: "Invalid email or password",
      });

    await this.userModel.findByIdAndUpdate(user._id, {
      lastLogin: new Date().toISOString(),
    });

    const { token, expiresIn } = this.sign(user);
    const { passwordHash, ...safeUser } = user.toObject();
    return { user: { ...safeUser, id: user._id.toString() }, token, expiresIn };
  }

  logout() {
    return { message: "Logged out successfully" };
  }

  // FIX BUG#5: tokens older than 30 days are rejected even if signature is valid
  async refreshToken(dto: RefreshTokenDto) {
    try {
      const payload = this.jwtService.verify(dto.token, {
        ignoreExpiration: true,
      });

      const GRACE_PERIOD = 30 * 24 * 60 * 60; // 30 days in seconds
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && now - payload.exp > GRACE_PERIOD) {
        throw new UnauthorizedException({
          code: "TOKEN_TOO_OLD",
          message: "Token has expired too long ago. Please log in again.",
        });
      }

      const user = await this.userModel.findById(payload.sub);
      if (!user || !user.isActive) throw new UnauthorizedException();
      const { token, expiresIn } = this.sign(user);
      return { token, expiresIn };
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException({
        code: "INVALID_TOKEN",
        message: "Invalid or malformed token",
      });
    }
  }
}
