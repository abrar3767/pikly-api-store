import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { Document } from "mongoose";

export type BannerDocument = Banner & Document;

@Schema({ timestamps: true })
export class Banner {
  @Prop({ required: true, unique: true })
  id: string;

  @Prop({ required: true })
  title: string;

  @Prop({ default: "" })
  subtitle: string;

  @Prop({ default: null })
  image: string;

  @Prop({ default: "" })
  ctaText: string;

  @Prop({ default: "" })
  ctaLink: string;

  @Prop({ default: "hero", enum: ["hero", "sidebar", "promo", "footer"] })
  position: string;

  @Prop({ default: null })
  startDate: string;

  @Prop({ default: null })
  endDate: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: 0 })
  sortOrder: number;
}

export const BannerSchema = SchemaFactory.createForClass(Banner);
BannerSchema.index({ isActive: 1, position: 1, sortOrder: 1 });
