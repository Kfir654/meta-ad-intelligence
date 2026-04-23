import { Document, Model, Schema, model } from 'mongoose';

export type AdPlatform =
  | 'facebook'
  | 'instagram'
  | 'twitter'
  | 'google'
  | 'tiktok'
  | 'messenger'
  | 'other';

export interface IAd extends Document {
  brandName: string;
  text: string;
  imageUrl: string | null;
  platform: AdPlatform;
  platforms: AdPlatform[];
  pageVerification: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const adSchema = new Schema<IAd>(
  {
    brandName: { type: String, required: true, trim: true },
    text: { type: String, required: true },
    imageUrl: { type: String, default: null },
    pageVerification: { type: String, default: null },
    platform: {
      type: String,
      required: true,
      enum: ['facebook', 'instagram', 'twitter', 'google', 'tiktok', 'messenger', 'other'],
      lowercase: true,
    },
    platforms: {
      type: [
        {
          type: String,
          enum: ['facebook', 'instagram', 'twitter', 'google', 'tiktok', 'messenger', 'other'],
          lowercase: true,
        },
      ],
      default: ['other'],
    },
  },
  { timestamps: true }
);

adSchema.index({ brandName: 'text', text: 'text' });

const Ad: Model<IAd> = model<IAd>('Ad', adSchema);
export default Ad;
