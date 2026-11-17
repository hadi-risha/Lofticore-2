import { Schema, model, type Types } from "mongoose";

export interface CategoryShape {
  name: string;
  slug: string;
  parent: Types.ObjectId | null;
  image?: string;
  order: number;
  isActive: boolean;
}

const categorySchema = new Schema<CategoryShape>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true },
    parent: { type: Schema.Types.ObjectId, ref: "Category", default: null, index: true },
    image: { type: String },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Category = model<CategoryShape>("Category", categorySchema);
